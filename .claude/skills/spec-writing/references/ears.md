# EARS acceptance criteria

EARS (Easy Approach to Requirements Syntax) gives every requirement one of five shapes.
Keywords are in capitals; `(shall)` marks a mandatory requirement.

| Pattern | Form | Use when |
|---|---|---|
| Ubiquitous | The system (shall) <response>. | always true, no trigger |
| Event-driven | WHEN <trigger>, the system (shall) <response>. | a user action or an event starts it |
| State-driven | WHILE <state>, the system (shall) <response>. | true for as long as a state holds |
| Unwanted behaviour | IF <unwanted condition>, THEN the system (shall) <response>. | failures, invalid input, limits hit |
| Optional feature | WHERE <feature is enabled>, the system (shall) <response>. | config flags, optional capabilities |

Patterns may combine once: `WHILE <state>, WHEN <trigger>, the system (shall) <response>.`
More than one combination means the AC must be split.

## Line format
```
- AC<n> (US<n>). <EARS sentence> _(observable: <what a test or a person sees>)_
```
The `_(observable: ...)_` hint is mandatory: `test-writer` asserts it and `plan-verifier`
checks it.
"the system" may be narrowed to the module that owns the response: "the API", "the PR
detail page", "the MCP server", "`reviewer-core`".

## Testability rules
1. **One trigger, one response.** "and" in the response usually means two ACs.
2. **Observable result.** Name what a test can see: HTTP status and body field, a UI state
   or text (by i18n key), a stored value, a log line (level and fields), an order, a count.
3. **Thresholds, not adjectives.** Replace "fast", "large", "many", "normal",
   "user-friendly", "gracefully", "appropriate", "etc." with a number or a concrete rule.
4. **No hidden how.** "Uses a queue", "via a React context", "with a Drizzle transaction"
   are implementation. State the effect: "two concurrent requests produce one review run".
5. **Negative space.** Unwanted behaviour ACs say what must *not* happen as well as what
   does: "IF the model call fails, THEN the API (shall) return 502 with `error.code`
   `model_unavailable` and (shall) store no partial findings."
6. **Linked.** Every AC names its user story; every user story has at least one AC.
7. **Unknown stays marked.** When a threshold, wording or behaviour is not settled, keep
   the AC and write `[NEEDS CLARIFICATION: <question>]` where the value belongs, with a
   matching "Open questions" entry. Never replace it with a guessed number.

## Vague → testable

| Vague | Testable |
|---|---|
| "Must work well on large repos" | WHEN the repository exceeds the indexing threshold, the system (shall) build the overview from deterministic facts only, without reading every file in full. |
| "Must not crash if the model is down" | IF the structured model call fails, THEN the system (shall) show the deterministic overview with the degradation reason. |
| "Should suggest where to start reading" | The system (shall) order the reading path by file rank in the import graph. |
| "Handle rate limits gracefully" | IF the review endpoint returns 429, THEN the PR detail page (shall) show the rate-limit message with the retry time and keep the run button disabled until then. |
| "Show progress" | WHILE a review run is in progress, the PR detail page (shall) append each Live Log event within 2 s of the server emitting it. |
| "Do not leak secrets" | The API (shall) never include a value from `SecretsProvider` in a response body, a log line or the Live Log. |

## Common mistakes
- Compound: "WHEN the user clicks Run, the system shall start a review and show a toast and
  disable the button." → three ACs.
- Untestable trigger: "WHEN appropriate" / "WHEN needed".
- Passive with no actor: "The review shall be stored." → who stores it, when, observable how?
- Design restated: "The button shall be blue." → only if the colour is the requirement
  (for example a contrast threshold); otherwise it belongs to the design source.
- Test steps disguised as ACs: "Open page, click X, check Y." → state the behaviour.

## Verify by (test lane)
Each AC gets the lowest lane from `TESTING.md` "Suite map" that can observe its result:

| Lane | Observes |
|---|---|
| `client` | component rendering, UI states, i18n keys, accessibility attributes (vitest + jsdom + RTL) |
| `server-unit` | service logic, validation, error mapping, no DB (hermetic vitest) |
| `server-integration` | DB effects, migrations, routes against real Postgres (`*.it.test.ts`) |
| `reviewer-core` | prompt building, grounding, finding parsing |
| `mcp` | MCP tool inputs and outputs against a fake API |
| `e2e web` | a full user journey across client and server (`e2e/specs/NN-*.flow.json`) |
| `manual` | only with a reason (for example visual quality of a model answer) |

An AC that only `manual` can verify is a smell: try to rewrite it with an observable result.
