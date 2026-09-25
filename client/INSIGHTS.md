# Insights — client

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it.

Entries are append-only: enrich or correct an existing one, never delete it.
Format — an H3 stating the claim, a dated body, and `path:line` evidence.
`/engineering-insights` maintains this file; see `.claude/skills/engineering-insights/`.

## What Works
<!-- Approaches and solutions that proved out. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — never skip it. -->

### Formatting a cost at fixed 4dp reports cheap real runs as free
`2026-09-25` — `formatCost` floored at `toFixed(4)`, so a run costing $0.000034
rendered "$0.00" — identical to a genuinely free run, and ~22 OpenRouter models
really are priced $0/$0, so both states occur side by side. Cheap models make
this routine: `mistralai/mistral-nemo` on a 3 400-token review costs $0.000069.
Values under $0.0001 now render "<$0.0001", keeping "$0.00" for actually free.
Any new money formatting here needs the same three-way split: unknown "—", free
"$0.00", too-small "<$0.0001".
Evidence: `client/src/components/run-cost-badge/helpers.ts:1-40`

## Codebase Patterns
<!-- Component folders, theming, data flow, providers — with the reason. -->

## Tool & Library Notes
<!-- Quirks of Next 15, React 19, TanStack Query, next-intl, the bundler. -->

## Recurring Errors & Fixes
<!-- Errors seen more than once, each with the fix that worked. -->

## Session Notes
<!-- Dated summaries. Two lines each — this is not a chat replay. -->

## Open Questions
<!-- Left unresolved, for whoever picks it up next. -->
