# Plan Verification: Onboarding Tour (SPEC-02) — scope code, round 1

Verdict: COMPLETE (code side). Test items not in scope for this pass.

- met: 46 items — goal, 7 in-scope bullets, 10 out-of-scope / do-not-touch checks, steps 1-14, AC1-AC16 (code side), NFR1-NFR10 / EC13 / EC15 / EC17 code side. partial 0, not met 0.
- Unverifiable here (needs running API / browser): step 9 "Done when" (`GET` returns `none` with `usable:false`, `POST` on seeded repo 409 — code at `server/src/modules/onboarding/service.ts:77-85`, `domain.ts:28-32`); steps 10/13 visual checks (`client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts:29`, `OnboardingView.tsx:141-148`); `TruncatedPath` ellipsis layout.
- Note: AC4 "buttons disabled" holds in the stored-tour case (`OnboardingView.tsx:174`); with no stored tour and status `generating` only the status renders.

## Key evidence
- Contract: `server/src/vendor/shared/contracts/knowledge.ts:28-135`; server and client Onboarding blocks identical.
- One LLM call: `service.ts:288-304` (`completeStructured`, `maxRetries:0`, `maxTokens:4000`, `timeoutMs:90000`, `withTimeout`); single-shot providers `container.ts:375-406`.
- Reading path rank: `domain.ts:79-88` (`pagerank*(1+hotness)`, path tie-break).
- Untrusted repo text wrapped with `wrapUntrusted` in `prompt.ts`; model paths grounded in `domain.ts:369-475`.
- Log line `onboarding.generated` once in `finally` (`service.ts:179-197`).

## Unplanned changes
- reviewer-core `SpecEntry` / `escapeLabel` (project-context feature; `wrapUntrusted` used by onboarding).
- `server/src/adapters/llm/openai.ts`: `lastRaw =res` spacing typo (fixed by main session).
- `client/src/components/app-shell/onboarding-nav.test.tsx` beyond §5.

## Tests on disk (§5, existence only)
server: `contracts.test.ts`, `onboarding-domain`, `onboarding-prompt`, `onboarding-service`, `onboarding-root-files`, `llm-single-shot`, `onboarding.it`; client: `nav.test.tsx`, `app-shell/helpers.test.ts`, `OnboardingView.test.tsx`, `OnboardingView/helpers.test.ts`, `hooks/onboarding.test.ts`; e2e: `08-onboarding-tour.flow.json`.

## Commands run
- `.claude/scripts/check-changed.sh server client --full` — PASS server typecheck · tests 347/347 · onion gate · PASS client typecheck · tests 215/215.
- `onboarding.it.test.ts` not run (Docker).
