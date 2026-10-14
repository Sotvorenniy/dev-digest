# Spec template and lifecycle

## File name and ID
- File: `YYYY-MM-DD-<feature-slug>.md` — creation date and a short kebab-case name, for
  example `server/specs/2026-10-14-review-retry.md`.
- `Spec ID: SPEC-NN` — one global sequence across root `specs/` and every `<pkg>/specs/`,
  zero-padded to two digits. Find the next free number with a grep for `Spec ID: SPEC-`,
  and grep again just before writing.
- The folder `README.md` "Index" gets the line
  `- [SPEC-NN — <feature name>](<file>) — <status>` (it replaces "None yet."). `spec-creator`
  returns this line in its Spec Report; the orchestrator applies it (a hook keeps
  `spec-creator` to the one spec file).

## Status
| Status | Set by | When |
|---|---|---|
| `draft` | `spec-creator` | on creation; on a revision only if the user says so |
| `approved` | the user only | before planning starts, and only with no `[NEEDS CLARIFICATION]` marker left |
| `implemented` | `doc-writer` | after the feature ships and is verified |
| `superseded by SPEC-NN` | the orchestrator, from `spec-creator`'s hand-off | a newer spec replaces this one's decision; only the `Status` line changes |

`implementation-planner` treats a `draft` spec, an Open question that blocks an AC, or a
`[NEEDS CLARIFICATION]` marker in an AC as a blocking finding for that AC.

## Unknowns
Never fill a gap with a plausible default. Write `[NEEDS CLARIFICATION: <exact question>]`
where the value belongs (an AC, an NFR threshold, a contract field) and add the question to
"Open questions" with the marker's location.

## Template
Use exactly these headings, in this order. Write "None" for an empty section.

```
# Spec: <feature name>
Spec ID: SPEC-NN
Status: draft | approved | implemented | superseded by SPEC-NN
Supersedes: <link to the older spec, or None>
Modules: <server, client, reviewer-core, mcp, e2e>

## Problem and user
<who has the problem, what it is today, why it matters. Cite current behaviour as `path:line`.>

## Goals / Non-goals
### Goals
- G1 ...
### Non-goals
- NG1 ...

## User stories
- US1. As a <role>, I want <capability>, so that <benefit>.

## Acceptance criteria (EARS)
- AC1 (US1). WHEN <trigger>, the system (shall) <response>. _(observable: <status code, UI state, stored value, log line, order>)_

## Edge cases
- EC1. <situation> — expected behaviour, or the AC that covers it.

## Non-functional requirements
- NFR1. <category> — <measurable requirement> — verify: <lane or method>

## Inputs and provenance
| Input | Source (user, GitHub, repo clone, DB, model output, config) | Trusted? | Used in |

## Untrusted inputs
- <input> — reaches <prompt / UI / log / DB / file path> — threat: <class> — the system (shall) <guard> — covered by: <AC or NFR>

## Traceability
| AC | Story | Goal | Covers (EC / NFR / untrusted input) | Verify by |

## Decisions
- P<n> — accepted | rejected | changed — <one line> — landed in: <AC / EC / NG / NFR>

## Open questions
- OQ1. <question> — category: C<n> — owner: <user / implementation-planner> — blocks: <AC or none> — marker: <location or none>

## Changelog
- YYYY-MM-DD — draft created
```

### Optional sections
Place them right after "Acceptance criteria", only when they carry information:
- `## Workflow` — one Mermaid flowchart or sequence diagram, about 20 nodes at most
  (`mermaid-diagram` skill).
- `## Contracts` — wire shapes in snake_case, nullability per field, error cases; no Zod
  code. Nullability words follow root `AGENTS.md`: `nullish` (optional or null),
  `nullable` (always present, may be null), `optional` (request inputs only). When
  `@devdigest/shared` changes, add an AC or EC that the server copy and the client copy
  carry the same shape (the two copies have drifted before).
- `## Code anchors` — place it last, before "Changelog". The verified `path:line` facts the
  research found (current behaviour, contracts, limits, entry points), one line each:
  `` `path:line` — <fact> ``. Facts only, no proposed changes. `implementation-planner`
  reuses them instead of re-reading the same files; it re-checks a line only when the
  plan depends on it.

## Section rules
- **Problem and user** — current behaviour cited as `path:line`; no solution here.
- **Goals / Non-goals** — a rejected proposal that a reader might expect goes to Non-goals.
- **Edge cases** — empty, loading, error, partial data, long text, many items, first-time
  use, concurrency (double submit, two tabs), timeouts, model or GitHub down, rate limits,
  stale data. Each has an AC or a Non-goal.
- **Untrusted inputs** — PR titles, bodies, diffs, comments, repo files, model output,
  user input. Name the threat class (`security` skill: prompt injection, stored XSS, path
  traversal, secret in log, SSRF) and the guard as an effect, not a technique.
- **Traceability** — one row per AC. Every goal appears at least once.

## Non-functional requirements
Consider each category; write an NFR only when it applies. Each NFR is measurable and has
a verify hint.

| Category | Example |
|---|---|
| Performance | The findings list (shall) render 500 findings with no request over 1 s at p95 on the dev stack. |
| Limits and rate limits | Use real numbers from the code (for example review runs: 10 requests/min). |
| Reliability | IF GitHub does not answer within 10 s, THEN the import (shall) fail with a retryable error. |
| Security and privacy | Secrets stay in `SecretsProvider`; never in logs, Live Log, prompts or responses. |
| Accessibility | WCAG 2.2 AA items from the `ux-review` skill (keyboard, focus, status messages). |
| i18n | New strings live in `client/messages/en/<ns>.json`; none inline in JSX. |
| Observability | What is logged (level, fields) and what is never logged. |
| Compatibility | Existing contracts, stored data and MCP tool behaviour stay valid. |

## Revisions
1. Edit the same file. Keep the Spec ID and the file name.
2. Never renumber. A removed item stays as `- ~~AC3~~ removed YYYY-MM-DD — <reason>`;
   new items take the next free number.
3. Update "Traceability" and "Decisions"; add a "Changelog" line
   `YYYY-MM-DD — <what changed and why>`.
4. A change to a goal or a non-goal is blocking: confirm it with the user first.
5. An `approved` spec goes back to `draft` only if the user says so.
6. When the user answers an open question, replace its `[NEEDS CLARIFICATION]` marker with
   the answer, close the "Open questions" entry and note it in the "Changelog".

## Size
About 15 ACs per spec at most. Above that, split by user-visible capability and link the
parts from each other's "Problem and user".
