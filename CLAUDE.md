# dev-digest (root) - agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each lesson adds one feature.

## Before answering
Search the relevant package's `<pkg>/docs/`, `<pkg>/specs/`, `<pkg>/INSIGHTS.md` first for what the user asks.
Packages: `server` · `client` · `reviewer-core` · `e2e`.
Read `<pkg>/INSIGHTS.md` before working in a package and name the entries that apply. Treat them as high-confidence guidance.

## Conventions (not obvious from code)
- Standalone packages, no workspace: cross-package code is **copied** into `src/vendor`, never imported.
- `server/src/vendor/shared` and `client/src/vendor/shared` are separate copies and have already drifted — a contract change means editing both or neither.
- pnpm in `server`/`client`, npm in `reviewer-core`/`e2e`. Separate lockfiles; do not unify.

## Do not touch
- `server/clones/**` — runtime git checkouts, git-ignored, never test input.
- `docker compose down -v` — drops the `devdigest_pgdata` volume and every imported repo and review.

## Use when
- Stack, quick start, architecture, how to run → read `README.md`
- Choosing or running a test suite → read `TESTING.md`
- Writing an agent system prompt or picking a template → read `docs/agent-prompts/README.md`
- Cross-cutting findings → read `INSIGHTS.md`
- Recalling prior findings, or wrapping up a task → run `/engineering-insights`
- Working inside a package → read `server/CLAUDE.md`, `client/CLAUDE.md`, `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md`
