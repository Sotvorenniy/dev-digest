# Insights — reviewer-core

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it.

Entries are append-only: enrich or correct an existing one, never delete it.
Format — an H3 stating the claim, a dated body, and `path:line` evidence.
`/engineering-insights` maintains this file; see `.claude/skills/engineering-insights/`.

## What Works
<!-- Prompt shapes, grounding rules and scoring that proved out. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — never skip it. -->

## Codebase Patterns
<!-- Purity contract, prompt slots, provider injection — with the reason. -->

### The scope policy is a trusted system-prompt addition, appended only when intent is supplied
`2026-10-04` — `buildScopePolicy` text is added to the SYSTEM message only when
`assemblePrompt` receives an `intent`; with `intent` undefined the prompt is
byte-identical to before. Derived intent itself goes in the untrusted user
block. Never move the policy into the user message and never add
policy-relevant text there: the INJECTION_GUARD says stated scope can never
descope a review.
Evidence: `reviewer-core/src/prompt.ts:80`

### Intent source labels are not machine-enforced — ids must match the server's
`2026-10-04` — Classifier sections are labelled `<id>:<kind>` and the model is
only told to cite the exact id. Nothing in reviewer-core checks it; the server
drops unknown ids from `used_source_ids` (`finaliseIntent`). The ids are
server-generated (`title-1`, `label-1`, ...) and passed in as
`IntentPromptInput.sourceIds`; hard-coding labels like `title:title` made
every built-in source silently uncitable.
Evidence: `reviewer-core/src/review/classify-intent.ts:72`,
`server/src/modules/intent/service.ts:237`

## Tool & Library Notes
<!-- Quirks of the LLM providers, Zod, and the type-only build. -->

## Recurring Errors & Fixes
<!-- Errors seen more than once, each with the fix that worked. -->

## Session Notes
<!-- Dated summaries. Two lines each — this is not a chat replay. -->

## Open Questions
<!-- Left unresolved, for whoever picks it up next. -->
