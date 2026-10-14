---
name: spec-writing
version: 1.0.0
description: "How dev-digest specs are written and read: EARS acceptance criteria, the spec template, traceability from goals to test lanes, measurable non-functional requirements, spec IDs, statuses and revisions, and the final self-check. Use this skill whenever you write or revise a spec under specs/ or <pkg>/specs/, review a spec for gaps before planning, map acceptance criteria to plan steps or tests, or verify finished work against a spec's ACs. Use it even when the user just says 'write a spec', 'add acceptance criteria', 'is this requirement testable?', 'EARS', 'which test proves AC3?' or 'update the spec'. Does NOT cover how to implement a requirement (use the implementation-planner's routed skills), UX gap analysis of a design (use ux-review), or e2e flow files in e2e/specs/*.flow.json."
---

# Spec writing

A spec says **what** the system does and **why**, in a form every later agent can check.
It never says **how**: no file-by-file changes, function bodies, component structure,
library choices, migration SQL or step lists. Those belong to the Implementation Plan.

Who uses this skill:

| Agent | Uses it to |
|---|---|
| `spec-creator` | write and revise specs (sole owner of spec content) |
| `implementation-planner` | review a spec for untestable or missing requirements; map every AC to a step and a test |
| `test-writer` | pick the test lane from each AC's "Verify by" |
| `plan-verifier` | check each AC by its observable result |
| `doc-writer` | set `Status: implemented` only; never edits ACs |

Read the reference for the task at hand, not all of them:

| Task | Read |
|---|---|
| Writing or judging an acceptance criterion | [references/ears.md](references/ears.md) |
| Writing a new spec, IDs, statuses, revisions, NFRs, traceability | [references/template.md](references/template.md) |
| Checking a spec before hand-off, or reviewing someone's spec | [references/self-check.md](references/self-check.md) |

## Core rules
1. **Testable or it does not ship.** Every AC has one trigger and one observable response
   (status code, UI state, stored value, log line, order). No vague words.
2. **Everything traces.** Goal → user story → AC → test lane. An edge case, NFR or
   untrusted input without a covering AC (or a Non-goal) is a gap.
3. **Facts are cited.** Every repo fact is `path:line`, verified. Unverified claims go to
   "Open questions".
4. **The user decides.** Gaps and improvements are `PROPOSED` until accepted; every
   proposal ends up in "Decisions".
5. **IDs are stable.** AC, EC, NFR, G, US numbers are never reused or renumbered; a removed
   item is struck through with a date and reason.
6. **Small specs.** About 15 ACs at most. A bigger feature is several specs.
7. **English only**, including the EARS keywords.
8. **Mark, never guess.** An unknown value or behaviour is written in place as
   `[NEEDS CLARIFICATION: <question>]` with a matching "Open questions" entry. A spec with a
   marker left stays `draft`; the ACs it touches are not planned until it is resolved.

## Where specs live
- One module touched → `<pkg>/specs/` (`server`, `client`, `reviewer-core`, `mcp`).
- Two or more modules, or an e2e-only change → root `specs/`.
- Never `e2e/specs/`: that folder holds `*.flow.json` runner input.
- Conventions summary for humans: [`specs/README.md`](../../../specs/README.md).
