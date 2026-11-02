# Onion Architecture Skill

**Version 1.1.0** · first-party · created 2026-09-28

## Changelog

**1.1.0** — Facade laundering: a cross-module import is judged by the file that declares
the symbol, not by its path. Checklist item (HIGH), `layers.md` subsection, example 8, and a
`check.sh` grep for facade files that re-export module internals.

**1.0.0** — Initial release: rules, examples, module templates, dependency-cruiser gate with
a 53-violation baseline, CI step in `server-unit.yml`.

## Motivation

The server already had the pieces of an onion — adapter ports in `@devdigest/shared`, a
composition root in `platform/container.ts`, repositories per module — but nothing kept
the direction of dependencies honest. Routes queried Drizzle directly, services took the
whole `Container`, adapters reached into modules. The sibling skills (`fastify-best-practices`,
`drizzle-orm-patterns`, `zod`) each cover one tool and say nothing about how the tools relate.

This skill owns that relationship and makes it mechanical: `server/.dependency-cruiser.cjs`
encodes the rings, and a baseline freezes existing debt so only **new** violations fail.

## Decisions

| Question | Decision |
|---|---|
| Where do new ports live? | `server/src/ports/` for shared, `modules/<m>/ports.ts` for local; `vendor/shared` ports are reused, never edited |
| Zod in the domain? | `import type` only (`z.infer`); no runtime zod in `domain.ts` / `ports.ts` |
| Routes-only modules? | Allowed while they do not touch the DB |
| Existing violations? | Baselined in `server/.dependency-cruiser-known-violations.json`; shrink it, never grow it |

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | Dependency rule, file roles, workflows (create / review / refactor), checklist |
| `examples.md` | BAD/GOOD pairs from this repo's code |
| `references/layers.md` | Placement decision, ports, service deps, mapping, cross-module access |
| `references/tools.md` | Fastify, Drizzle (+ UnitOfWork), Zod, adapters, Container, dependency-cruiser |
| `references/testing.md` | Test type per ring |
| `references/this-repo.md` | Baselined violations by kind and the refactor order |
| `references/sources.md` | Articles and docs the rules come from |
| `templates/module/*.tmpl` | New-module skeleton (`__name__`, `__Entity__`, `__table__` placeholders) |
| `scripts/check.sh` | The gate: depcruise `--ignore-known` + `container.db` grep. Used by CI |
| `evals/eval.md` | Review eval: task prompts, output contract, grading (recall ≥ 0.9, no false positives) |
| `evals/expected-findings.json` | Answer key: 9 planted violations (3 cases × 3) with file, lines, rule, severity |
| `evals/fixtures/` | Code under review, one folder per case, paths mirror `server/src`. No hint comments |

## Enforcement outside the skill

- `server/.dependency-cruiser.cjs` — the rules.
- `server/.dependency-cruiser-known-violations.json` — the baseline.
- `.github/workflows/server-unit.yml` — "Architecture boundaries" step in the typecheck job.

## First-party

Not in `skills-lock.json` — a sync would treat it as drift.
