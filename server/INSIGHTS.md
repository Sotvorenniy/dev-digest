# Insights — server

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it.

Entries are append-only: enrich or correct an existing one, never delete it.
Format — an H3 stating the claim, a dated body, and `path:line` evidence.
`/engineering-insights` maintains this file; see `.claude/skills/engineering-insights/`.

## What Works
<!-- Approaches and solutions that proved out. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — never skip it. -->

### The static pricing table shipped fabricated prices for every OpenRouter slug
`2026-09-25` — `PRICING` in `server/src/adapters/llm/pricing.ts` looked
authoritative but was wrong for all four OpenRouter models it listed, checked
against `openrouter.ai/api/v1/models`: `z-ai/glm-4.7-flash` was a 0/0 "free
baseline" while actually costing $0.0605/$0.40 per 1M, so a paid run rendered a
confident "$0.00"; `deepseek-v4-flash` ~3x over; `z-ai/glm-5.1` ~40% under;
`z-ai/glm-4.7-flashx` is not a real slug. It also listed no current Anthropic
model, so a run on the documented default priced to null. Treat it as a
last-resort snapshot, never truth: verify a row against the provider before
relying on it, and DELETE a row you cannot verify — an absent slug yields null
and renders "—", while a wrong row renders as fact.
Evidence: `server/src/adapters/llm/pricing.ts:1-20`,
`server/test/adapters.test.ts` ("never prices a paid model at zero")

## Codebase Patterns
<!-- Module layout, DI flow, repository conventions — with the reason. -->

### A service can't call `resolveFeatureModel` directly — it takes `Container`, which cycles back
`2026-09-28` — `modules/settings/feature-models.ts`'s `resolveFeatureModel(container, workspaceId,
id)` takes `Container` as its first parameter, so calling it from `platform/container.ts` (to
bind a per-feature service's model resolution into a closure) creates a `container.ts <->
feature-models.ts` `no-circular` violation the moment `container.ts` imports it — even though
`container.ts` is otherwise exempt from every other onion-architecture rule as the composition
root. A `service.ts` obviously can't call it either (services must never import `Container` at
all — see the onion-architecture skill). Worked around for the `conventions` module by
duplicating the tiny override-read/default-fallback logic directly in `container.ts` as a
private method reading `t.settings` + `FEATURE_MODELS` itself, never importing
`feature-models.ts`. A second feature needing this should promote it to a real method/port
instead of a third copy-paste.
Evidence: `server/src/modules/settings/feature-models.ts:51` (`resolveFeatureModel` signature),
`server/src/platform/container.ts` (`resolveFeatureModelFor`)

### Widening `SkillSource` needs no migration — the column is `text`
`2026-09-28` — `skills.source` is `text('source', { enum })`, so the enum is
TypeScript-only. Adding a value (e.g. `imported_file`) means editing the Drizzle
enum plus BOTH vendored `SkillSource` zod enums; `drizzle-kit generate` emits
nothing for it. Do not hand-write a migration. Non-manual sources are still
forced `enabled: false` by `SkillsService.create` and wrapped as untrusted in
`run-executor.ts`, whatever the new value is called.
Evidence: `server/src/db/schema/skills.ts:13`,
`server/src/vendor/shared/contracts/knowledge.ts:118`

### Findings have no `api`/contract category — API-contract agents must use `bug`
`2026-09-28` — `FindingCategory` is `bug | security | perf | style | test`, so a
reviewer prompt for API-contract problems has to tell the model to emit `bug`;
no other value fits. Adding a real category means editing both vendored
`findings.ts` copies plus the DB and UI enums, so treat it as its own task.
Evidence: `server/src/vendor/shared/contracts/findings.ts:14`

## Tool & Library Notes
<!-- Quirks of Fastify, Drizzle, Postgres/pgvector, tsx, vitest. -->

### "pnpm is broken" is a corepack shim/package mismatch — a standalone pnpm fixes `pnpm add` too
`2026-09-28` — see `client/INSIGHTS.md`'s matching entry for the full
root-cause writeup (corepack's cached pnpm@12.6.0 ships `bin/pnpm.mjs` but the
corepack shim looks for `bin/pnpm.cjs`). It affects `server/` identically.
`npm install -g pnpm@10 --prefix /tmp/pnpm-global` then
`/tmp/pnpm-global/bin/pnpm install --frozen-lockfile` installs clean against
this repo's `lockfileVersion: '9.0'` lockfile — this is what actually unblocks
adding a new server dependency, not just running an existing script via
`./node_modules/.bin/<bin>`.
Evidence: `server/pnpm-lock.yaml:1`, `client/INSIGHTS.md` ("pnpm is broken" entry)

### PriceBook.estimate returns a different price on the first call after boot
`2026-09-25` — `estimate()` is synchronous and refreshes its OpenRouter cache in
the BACKGROUND, so the first call after a cold start (or 6h TTL expiry) returns
the static fallback table and later calls return live prices. Observed: the same
run re-priced at $0.00182308 then $0.00062349 seconds apart. Costs PERSISTED at
run completion are unaffected; only read-time recomputation skews. Call
`refresh()` at boot if a stable number matters.
Evidence: `server/src/platform/price-book.ts:59-72`

`2026-09-25` — Mitigated: `server/src/server.ts` now fires
`container.priceBook.refresh()` after `listen()`, so the first read already uses
live prices. Verified: three consecutive reads of one run all returned
0.0006198472, where the first previously returned the snapshot's 0.00182308. The
lazy-refresh behaviour itself is unchanged — a 6h TTL expiry mid-process still
skews one call, and only re-priced (null `cost_usd`) rows are affected.

## Recurring Errors & Fixes
<!-- Errors seen more than once, each with the fix that worked. -->

### dependency-cruiser's `--ignore-known` baseline is already stale for repo-intel's circular imports
`2026-09-28` — Running `.claude/skills/onion-architecture/scripts/check.sh` after ANY edit to
`platform/container.ts` — even one unrelated to repo-intel — reports 8 `no-circular` errors for
`repo-intel/service.ts`/`pipeline/{full,incremental}.ts`/`index.ts`/`routes.ts` and
`_shared/context.ts`, all routed through `container.ts`. These are NOT new: verified by
`git stash push -- server/src/platform/container.ts server/src/modules/index.ts` (reverting to
HEAD) and re-running the gate — the identical 8 errors reproduce on unmodified `HEAD`.
`.dependency-cruiser-known-violations.json`'s repo-intel cycle entries record a SHORTER path
(e.g. `container.ts → repo-intel/service.ts` direct) than what depcruise now reports (e.g.
`container.ts → repo-intel/index.ts → repo-intel/routes.ts → repo-intel/service.ts`) for the
same underlying cycle — the baseline is stale, not the code newly broken. Confirm with the
stash-and-recheck trick above before assuming your own change caused them, and don't
regenerate the baseline to "fix" them (regenerating would GROW it, violating the skill's
"baseline must only shrink" rule) unless deliberately paying down the repo-intel
Container-in-service violation itself.
Evidence: `server/.dependency-cruiser-known-violations.json` (repo-intel cycle entries),
`.claude/skills/onion-architecture/scripts/check.sh`

## Session Notes
<!-- Dated summaries. Two lines each — this is not a chat replay. -->

## Open Questions
<!-- Left unresolved, for whoever picks it up next. -->
