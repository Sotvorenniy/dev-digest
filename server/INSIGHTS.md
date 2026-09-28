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

## Session Notes
<!-- Dated summaries. Two lines each — this is not a chat replay. -->

## Open Questions
<!-- Left unresolved, for whoever picks it up next. -->
