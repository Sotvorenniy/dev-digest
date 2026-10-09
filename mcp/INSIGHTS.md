# Insights — mcp

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it.

Entries are append-only: enrich or correct an existing one, never delete it.
Format — an H3 stating the claim, a dated body, and `path:line` evidence.
`/engineering-insights` maintains this file; see `.claude/skills/engineering-insights/`.

## What Works
<!-- Tool shapes, polling and output trimming that proved out. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — never skip it. -->

## Codebase Patterns
<!-- Thin-wrapper contract, own schemas, stdout rule — with the reason. -->

### The review POST is fire-and-forget; blocking means polling /pulls/:id/runs
`2026-10-08` — `POST /pulls/:id/review` creates the `agent_runs` rows, starts
`executeRuns` without awaiting and returns `{ runs, reviews: [] }` at once, so a
tool that wants the result must poll `GET /pulls/:id/runs` itself. A run turns
`done` only after its review and findings are persisted, so "no returned run is
`running`, then `GET /pulls/:id/reviews`" is safe. Findings are read from the
reviews list filtered by `run_id`; never call `/runs/:id/trace` (full prompt).
Evidence: `server/src/modules/reviews/service.ts:133-139`,
`server/src/modules/reviews/run-executor.ts:315-341`

### get_findings is a third copy of the newest-review-per-agent rule
`2026-10-08` — With no `run_id`, `get_findings` shows the newest review per
`agent_id`; each review with a null `agent_id` is its own bucket (keyed by
review id). Multi-agent review writes
one review per agent, so "the latest review" is whichever agent finished last
and a re-run would double-count if every review were shown. The same rule
already lives in the server list column and the client badge; the three copies
must move together (`@devdigest/shared` is not importable here).
Evidence: `server/src/modules/pulls/domain.ts:32`,
`client/src/lib/latest-reviews.ts:27`, `INSIGHTS.md:27-33`

### Every server string reaching the model goes through clip(); the 12K cap covers every tool
`2026-10-08` — `title`, `file`, `run.error`, `scan.error` and summaries are
server text the model reads, so each is clipped (`clip`, `TEXT_CLIP`) and the
untrusted note is added whenever such text is present. `paginate` clips an
oversized first item instead of bypassing `maxChars`, and `run_agent_on_pr`
caps its runs and top-findings lists too. `agent_runs.error` is the raw
`err.message` stored by the run executor, unredacted unlike the intent path:
treat it as untrusted, unbounded text.
Evidence: `mcp/src/format.ts:24-40`, `mcp/src/tools/run-agent-on-pr.ts:123-135`,
`server/src/modules/reviews/run-executor.ts:408`

### GET /pulls/:id/reviews returns every review kind; nothing writes 'summary' yet
`2026-10-08` — The endpoint does not filter `kind`. Only the server's PR-list
and smart-diff queries keep `kind='review'`. No writer emits `'summary'` today,
but `get_findings` drops `kind === 'summary'` before the newest-per-agent rule
(not on the `run_id` path) so a future summary review cannot displace an agent's.
Evidence: `server/src/modules/reviews/run-executor.ts:320`,
`server/src/db/seed.ts:147`, `mcp/src/tools/get-findings.ts:46`

### paginate() clips only top-level strings, so get_blast_radius reserves envelope chars
`2026-10-09` — Nested arrays (callers per symbol) are not measured by
`paginate`, so a single huge symbol can break the 12K cap. `get_blast_radius`
reserves `BLAST_ENVELOPE_CHARS` (1500) for the envelope, pages whole symbol
rows, and trims one symbol's callers when needed (`callers_omitted`). With a
frozen input shape there is no cursor: `truncated` plus a "pass path to narrow"
hint is the only way to see more.
Evidence: `mcp/src/tools/get-blast-radius.ts`, `mcp/src/constants.ts`

## Tool & Library Notes
<!-- Quirks of @modelcontextprotocol/sdk v1, zod and Claude Code limits. -->

## Recurring Errors & Fixes
<!-- Errors seen more than once, each with the fix that worked. -->

## Session Notes
<!-- Dated summaries. Two lines each — this is not a chat replay. -->

## Open Questions
<!-- Left unresolved, for whoever picks it up next. -->
