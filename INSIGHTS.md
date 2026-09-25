# Insights — root

Non-obvious findings and gotchas that span packages. Add an entry whenever
something surprised you, so the next agent/session doesn't relearn it.

Entries are append-only: enrich or correct an existing one, never delete it.
Format — an H3 stating the claim, a dated body, and `path:line` evidence.
`/engineering-insights` maintains this file; see `.claude/skills/engineering-insights/`.

## What Works
<!-- Approaches and solutions that proved out. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — never skip it. -->

### A contract field added to RunStats must be optional, not just nullable
`2026-09-25` — `RunStats` is parsed out of the `run_traces.trace` jsonb column,
so it validates documents written under OLDER schema versions. Adding
`cost_usd: z.number().nullable()` makes the KEY required and fails every trace
stored before the field existed; `.nullish()` is required. The same holds for
any contract that parses persisted JSON rather than a fresh request payload.
Evidence: `server/src/vendor/shared/contracts/trace.ts:65`,
`server/test/contracts.test.ts` ("parses a stored trace with no cost_usd key")

## Codebase Patterns
<!-- Conventions and architectural decisions, with the reason. -->

## Tool & Library Notes
<!-- Dependency quirks: Drizzle, Fastify, Next, pgvector, OpenRouter. -->

## Recurring Errors & Fixes
<!-- Errors seen more than once, each with the fix that worked. -->

### `pnpm <script>` fails via corepack — call node_modules/.bin directly
`2026-09-25` — Every `pnpm` invocation dies with `Error: Cannot find matching
keyid: {"signatures":[...]}` from corepack's signature check, so `pnpm
db:generate` / `db:migrate` / `test` cannot run as the READMEs document.
Workaround that works: call the binary directly —
`./node_modules/.bin/drizzle-kit generate`,
`./node_modules/.bin/tsx src/db/migrate.ts`, `./node_modules/.bin/vitest run`.
Evidence: corepack bundled with Node v20.17.0 (README asks for Node >= 22)

## Session Notes
<!-- Dated summaries. Two lines each — this is not a chat replay. -->

## Open Questions
<!-- Left unresolved, for whoever picks it up next. -->
