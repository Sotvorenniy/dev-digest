---
name: dependency-checker
version: 1.2.0
description: "Audits every dependency of every dev-digest package (each root folder with its own package.json: server, client, reviewer-core, e2e, mcp, evals): draws the package/dependency graph as Mermaid, measures disk size per dependency (own and with transitive deps), flags unused, undeclared (phantom), misplaced (prod vs dev), version-drifting, duplicated and heavy dependencies, plus package-manager/lockfile conflicts and packages with no CI, and ends with a prioritised P0/P1/P2/Info list and a short summary of takeaways. Use when the user asks to check, audit, review or visualise dependencies, 'what is heavy in node_modules', 'what can we remove', 'dependency graph', 'bundle/install size', 'unused packages', 'version drift', or runs /dependency-checker. Read-only: reports, never edits package.json or lockfiles. Does NOT update versions (no `npm update`), scan CVEs (use security) or check import architecture (use onion-architecture / frontend-ui-architecture)."
---

# Dependency checker

Facts come from a script. The model verifies them and writes the advice.

```
scripts/analyze.mjs ──► .devdigest/cache/deps-check/report.json   (machine facts)
                    └─► .devdigest/cache/deps-check/report.md     (draft report)
model: verify P0/P1 findings ──► final report in the fixed structure below
```

## Workflow

1. **Run** `node .claude/skills/dependency-checker/scripts/analyze.mjs` (Node 20+, no install needed; `--top <n>` rows per package, default 8). It does not need `pnpm`.
2. **Read** `report.md`. A package with `not installed` has no sizes — say so, do not guess.
3. **Verify every P0 and P1 finding** before reporting it. The script is a heuristic:
   - `internal-boundary-crossing` → open the file at the reported line; confirm it is a real import and not a string or comment.
   - `possibly-unused` → grep the package for the name, check config files, `package.json` scripts, string-based loading (e.g. Fastify autoload, pino transports) and peer dependencies. Drop it or mark it `confirmed`.
   - `undeclared-dependency` → confirm the import is real code, not a string inside a test or a comment, and that the package is not a path alias. It resolves today only because another package pulls it in.
   - `prod-should-be-dev` → check that nothing under `src/` (non-test) imports it at runtime, and whether `start`/`build` scripts need it.
4. **Add judgment** the script cannot: which heavy dependency is actually shipped to users (client prod deps) versus dev-only disk cost; known lighter alternatives; whether version drift is harmless.
5. **Print the report** in the structure below. Do not dump the raw `report.md`.

## Without a shell

If the dependency data is already in the conversation (declared versions, installed sizes, import greps) or you
have no shell, **do not try to run the script and do not ask for tools**. Build the report from the data you
have, in the same five sections, and say in Scope that sizes and usage come from the supplied data. Apply the
same checks by hand: internal vs external dependencies, a relative import into another package's source,
version drift across packages, a declared dependency that nothing imports.

## Output contract (fixed order, five sections)

1. **Scope** — which packages were analysed (a folder with its own `package.json` at the repo root), which are installed, and what was NOT checked: CVEs, licences, outdated versions (needs network), real bundle size, dynamic or runtime-only loads. One table: prod/dev count, unique installed packages, disk size, lockfiles.
2. **Dependency graph** — a fenced ```mermaid block using `flowchart LR`, from `report.md`. Internal links (path alias, relative import) are solid edges and external dependencies shared by 2+ packages are dotted circles; label the internal edges so internal and external dependencies are never mixed. If it exceeds ~25 nodes, show only dependencies shared by 2+ packages. This repo is **not** a monorepo: never say packages are linked by `workspace:*` or pnpm workspaces.
3. **Size breakdown** — a table of the heaviest dependencies per package (own vs with transitive, kind, usage), plus per-package totals. State that sizes are on-disk bytes, not bundle or gzip size, and that transitive columns overlap.
4. **Findings & Priorities** — grouped under explicit tiers **P0, P1, P2, Info**, never an unranked list. Each finding names a package, a dependency or `file:line`, the evidence and a specific fix. Order inside a tier: biggest saving or risk first. Only verified P0/P1 findings. Removing or moving a dependency is a **recommendation for the user to confirm**, never something already done.
5. **Summary** — 3-5 concrete takeaways ordered by priority, each with the expected saving or risk. Mark anything that touches a lockfile as needing the user's approval.

## Priority rubric

| Tier | Meaning | Rules |
|---|---|---|
| **P0** fix now | Breaks, or hides a break; small safe change | `internal-boundary-crossing` (a package reaches into another by relative path instead of its public entry or alias), `undeclared-dependency` |
| **P1** fix soon | Wrong or dead weight | `prod-should-be-dev`, verified `possibly-unused` |
| **P2** plan | Real cost or drift; needs a decision | `heavy` (≥ 20 MB transitive), `version-drift`, `multiple-lockfiles`, `package-manager-mismatch`, `placeholder-config`, `not-installed` |
| **Info** | Low impact | `duplicate-versions` (one row per package), `no-ci` |

Name version drift explicitly with the ranges and packages involved, and name an unused dependency (declared but never imported) as its own finding.

## Repo rules the advice must respect

- Standalone packages (`server`, `client`, `reviewer-core`, `e2e`, `mcp`, `evals`), **no workspace** — a change is made per package. Cross-package code is copied (`src/vendor`), never imported.
- Never unify lockfiles. In `server`/`client` the pnpm lockfile is authoritative. `reviewer-core`, `e2e`, `mcp` use npm.
- `pnpm` is broken in this environment: advise the command, do not run it. Never run install, update or remove yourself.
- `reviewer-core` must stay `openai` + `zod` only; `e2e` must have no runtime deps. Flag any advice that would break these.
- The `server` `@ast-grep/napi` version is pinned on purpose — never advise bumping it.
- Report text is English.

## Environment constraints

- **No `pnpm`.** The script reads `node_modules` and `package.json` directly, so it works. Advice must name the command (`pnpm remove ...`), never run it.
- **Needs an install.** Sizes come from `node_modules`. A fresh clone or CI job without installs yields `not-installed` and no sizes; say so and stop at declared facts.
- **Offline.** No outdated or CVE data. Do not claim a version is "old" without a source.
- **Runs anywhere.** Node 20+, built-ins only. `--root <dir>` points it at a copy outside git (used by eval runners).
- **Read-only.** Output goes to `.devdigest/cache/deps-check/` (git-ignored).

## Limits of the script

- Sizes are `node_modules` bytes on disk (symlinks resolved once, so pnpm shared deps are not double counted in the package total).
- Usage is a static text scan: imports, quoted names, CSS `@import`, npm scripts, peer deps. It misses computed requires.
- Version drift compares declared ranges, not installed versions.
- `undeclared-dependency` can fire on import-like text inside a non-test string; verify before reporting.
- `no-ci` only looks for the package folder name in `.github/workflows`.
