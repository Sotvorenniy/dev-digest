# Implementation Plan: PR Why + Risk Brief (SPEC-03)

## 0. Spec readiness
- Source: `specs/2026-10-15-pr-why-risk-brief.md` (SPEC-03), `Status: approved` (spec line 3). The spec is untracked in git (git status at session start), so it needs committing.
- Spec readiness: ready ACs AC1–AC18. AC17 and AC18 are P3 and optional (spec lines 252-261). Blocked ACs: None.
  - Self-check "For reviewers of a spec" (`.claude/skills/spec-writing/references/self-check.md:24-29`): items 1, 2, 3, 5, 8 and 15 pass. Every AC has an ID, an EARS form, an `_(observable: ...)_` hint and a "Verify by" lane (Traceability, spec lines 545-567).
  - There is no `[NEEDS CLARIFICATION]` marker, and OQ1–OQ3 are closed (spec lines 636-643).
  - No AC conflicts with `AGENTS.md`, the INSIGHTS files or a skill rule. AC5 reuses `groundFindings()` unchanged (`reviewer-core/AGENTS.md` "Do not touch").
- Spec gaps routed to spec-creator. None blocks an AC. Where the spec is silent, the plan follows its literal text:
  1. **The linked issue is not stored.**
     - The workflow says "read PR + linked issue" from the DB (spec line 277), but `pull_requests` has no issue column (`server/src/db/schema/pulls.ts:5-34`).
     - `PrDetail.linked_issue` is built only by a live GitHub call (`server/src/adapters/github/octokit.ts:91,118,129-137`).
     - The plan fetches the issue live with `GitHubClient.getIssue`, using the `#N` rule from `octokit.ts:130`, with a 5 s overall timeout.
     - No token, no reference, a timeout or a failed fetch gives `{issue, absent}`. This matches the `undefined` that `octokit.ts:134-136` returns on failure.
     - spec-creator should say whether a failed fetch should be `unavailable` instead. Blocks: none.
  2. **"No spec included" has two cases.** One is no attachments; the other is attachments that exist but none can be included. AC4 gives an observable only for the first. The plan records `absent` for both. Blocks: none.
  3. **Stale intent with a null `pr_intent.head_sha`** (the column is nullable, `server/src/db/schema/reviews.ts:63`). The plan compares the values as strings, so null counts as `stale`. Blocks: none.
  4. **Prompt-budget cuts beyond the contract.**
     - `truncated.files` is defined as "files left out over the 300-file cap" (spec line 332). The plan also counts files left out by the 40k budget.
     - Cross-model finding 2 adds two nullish fields to `BriefTruncated`: `callers` (an int, caller paths left out) and `blast_summary` (a boolean). This is a contract addition beyond spec lines 331-334, approved by the user. spec-creator should record it.
     - Hunk headers dropped by the 20-per-file cap or the budget are still not recorded.
     - PR and issue titles are capped at 500 chars. GitHub limits titles to 256, so the cap is a guard only and is not recorded.
     - Blocks: none.
  5. **Source of the head SHA.** Resolved by the user's decision on cross-model finding 1. `GET /pulls/:id` now persists the live `head_sha` (Step 8), so the brief's `pull_requests.head_sha` matches `PrDetail.head_sha` (AC6, AC10). This changes PR status derivation the same way polling already does (`server/src/modules/pulls/status.ts:51`; `server/src/modules/polling/routes.ts:42,53`). spec-creator should record it as a decision.
  6. **Order of caps and grounding (EC14).** The plan dedupes Review focus items by (file, line), then grounds, then keeps the first 8 survivors in model order. Duplicates, grounding drops and cap drops all count in `dropped.review_focus`. For risks, `dropped.file_refs` counts only refs removed by grounding (plus duplicate refs inside one risk). Refs of a risk removed by the 8-risk cap are not counted again: the risk is counted in `dropped.risks`. Blocks: none.
  7. **The NFR11 seeded brief must be "grounded"**, but the seeded PR #482 files have no `patch` (`server/src/db/seed.ts:126-131`). The plan adds one 4-line patch to the seeded `src/config.ts`, on fresh seeds only (Step 9). Blocks: none (decision recorded).
- Answered implementation questions:
  - Execution mode: multi-agent, one implementer per phase (user, input).
  - Test-writer is on (`/run-plan --with-tests`), so §5 names the tests for each step (user, input).
  - All findings of the cross-model review are accepted, including persisting `head_sha` on PR detail refresh (user, via the orchestrator).
- Recommendations (none in scope):
  - Promote `Container.resolveFeatureModelFor` (`server/src/platform/container.ts:202-215`) into a settings port. The brief is its fourth caller (server INSIGHTS "A service can't call `resolveFeatureModel` directly"). Not asked. Impact on scope: none.
  - Record in `server/INSIGHTS.md` through `engineering-insights`: (a) the linked issue is never persisted; (b) `GET /pulls/:id` now persists `head_sha` (Step 8), which changes PR status after a token refresh. Not asked. Impact on scope: none (doc-writer).
- Cross-model review (Sonnet, `.claude/plans/pr-why-risk-brief/cross-model-review.md`); every finding is applied:
  - **F1 (HIGH) stale SHA with a token:** Step 8, plus the token-path IT case in §5 (`brief.it.test.ts`). Moved out of §6 risks.
  - **F2 prompt budget:** Steps 1 (`truncated.callers`, `truncated.blast_summary`), 2 (caps), 3 (explicit over-budget order and invariant); §5 5,000-caller fixture.
  - **F3 output tokens:** Step 2 (`BRIEF_MAX_OUTPUT_TOKENS = 5_000`), Step 3 (short explanations in the system prompt).
  - **F4 single-call wiring:** Step 7, plus §5 NEW `server/test/brief-wiring.test.ts`.
  - **F5 phase size:** §8 Phase 3a (steps 10–13) and Phase 3b (steps 14–15, Step 15 deferrable). The old Step 5 is split into Steps 5 and 6.
  - **F6 diff focus effect:** Step 14, plus §5 "no re-scroll on re-render".
  - **F7 (LOW):**
    - a. role and order assignment moved to the domain (`buildPromptFiles`, Step 2); the service import lists are exact (Steps 5, 6);
    - b. `classifyLlmFailure` matches exact names and phrases (Step 2);
    - c. empty POST body with a JSON content-type (Step 7, IT case);
    - d. an always-mounted `aria-live` region and the global focus ring (Step 12);
    - e. a 5 s linked-issue timeout, fetched in parallel (Step 5);
    - f. focus dedupe and the cap-drop definitions (Step 2, §0 gap 6);
    - g. the P3 banner uses the newest review that has a verdict (Steps 13, 15; test);
    - h. e2e 04 and 05 checked for seed side effects (§6);
    - i. POST response schema `PrBrief` (Step 7);
    - j. the dead `unavailable` and `unavailableHint` keys removed (Step 11).

## 1. Goal and scope
- Goal: add a PR Brief card on the PR Overview tab.
  - On an explicit click, one single-shot model call turns stored facts into a summary, Risk areas and Review focus. The facts are the PR text, the linked issue, intent, the blast summary and caller files, diff stats with roles and hunk headers, and attached specs.
  - The answer is grounded against the diff and stored per PR with its head SHA.
  - Review focus items deep-link to the file and line on the Files changed tab.
- In scope:
  - the `PrBrief` contract extension in both vendored `brief.ts` copies;
  - a new server module `server/src/modules/brief/` (constants, domain, prompt, ports, repository, service, routes), the new `server/src/prompts/brief.system.md`, a container getter and a registry entry;
  - persisting `head_sha` in the `GET /pulls/:id` token refresh (F1);
  - a seeded, grounded `pr_brief` row for PR #482 (NFR11), plus one seeded patch;
  - client: `lib/hooks/brief.ts`, the `brief` i18n namespace, `PrBriefCard` on the Overview tab, and `?tab=diff&file=&line=` focus in DiffTab → diff-viewer;
  - P3 (optional, AC17/AC18): the verdict banner and expandable risk rows;
  - the e2e flow `e2e/specs/09-pr-brief.flow.json`.
- Out of scope:
  - NG1–NG10;
  - DB schema changes and migrations: `head_sha` and `generated_at` live in `pr_brief.json`;
  - `reviewer-core/**` and `client/src/vendor/ui/**`;
  - any other change to `pulls/routes.ts` beyond the one `headSha` field.
- AC coverage:
  - AC1 — Steps 1, 7, 12, 13 — NEW `PrBriefCard.test.tsx`, NEW `OverviewTab.test.tsx` (client); NEW `server/test/brief.it.test.ts` (it)
  - AC2 — Steps 6, 7 — NEW `server/test/brief-service.test.ts` (hermetic); NEW `server/test/brief-wiring.test.ts` (hermetic)
  - AC3 — Steps 3, 5 — NEW `server/test/brief-prompt.test.ts`, `brief-service.test.ts` (hermetic)
  - AC4 — Steps 2, 5 — NEW `server/test/brief-domain.test.ts`, `brief-service.test.ts` (hermetic)
  - AC5 — Steps 2, 6 — `brief-domain.test.ts`, `brief-service.test.ts` (hermetic)
  - AC6 — Steps 4, 6, 8 — `brief.it.test.ts` (it), including the token path
  - AC7 — Steps 11, 12 — `PrBriefCard.test.tsx` (client); `09-pr-brief.flow.json` (e2e)
  - AC8 — Steps 12, 13, 14 — `DiffTab.test.tsx`, `PrBriefCard/helpers.test.ts` (client); `09-pr-brief.flow.json` (e2e)
  - AC9 — Steps 7, 10, 12 — `PrBriefCard.test.tsx` (client); `brief.it.test.ts` (it); e2e
  - AC10 — Steps 8, 12 — `PrBriefCard.test.tsx`, `helpers.test.ts` (client); `brief.it.test.ts` token path (it)
  - AC11 — Steps 10, 12 — `PrBriefCard.test.tsx` (client)
  - AC12 — Step 12 — `PrBriefCard.test.tsx` (client)
  - AC13 — Steps 2, 6, 7 — `brief-service.test.ts` (hermetic); `brief.it.test.ts` (it)
  - AC14 — Step 12 — `PrBriefCard.test.tsx`, `helpers.test.ts` (client)
  - AC15 — Step 6 — `brief-service.test.ts` (hermetic)
  - AC16 — Steps 6, 12, 13 — `brief-service.test.ts` (hermetic); `brief.it.test.ts` (it); `PrBriefCard.test.tsx` (client)
  - AC17 (P3) — Step 15 — `PrBriefCard.test.tsx`, `helpers.test.ts` (client)
  - AC18 (P3) — Step 15 — `PrBriefCard.test.tsx` (client)
  - ECs and NFRs without their own row are traced in §5.

## 2. Applicable constraints
- INSIGHTS entries:
  - root — "A contract field added to RunStats must be optional, not just nullable". Every new `PrBrief` field, including `truncated.callers` and `truncated.blast_summary`, is `.nullish()` (Step 1).
  - root — "`pnpm <script>` fails via corepack". Run bins as `./node_modules/.bin/<bin>`. No new dependencies.
  - root — "Agent path-guard hooks resolve paths against the session cwd". The main session stays at the repo root before it spawns writers.
  - root — "A PR-list rollup taken from the LATEST review…". The P3 banner shows one review's verdict and score: the newest review that has a verdict (F7g).
  - server — "`container.llm()` cannot promise exactly one HTTP request; use `llmSingleShot`". Steps 6 and 7 use it with `maxRetries: 0`; §5 `brief-wiring.test.ts` proves the wiring (F4).
  - server — "A service can't call `resolveFeatureModel` directly". Bind `resolveFeatureModelFor(ws, 'risk_brief')` in `container.ts`.
  - server — "Prompt logs are metadata-only". `brief.generated` and `brief.failed` carry ids, counts, enums and cost only.
  - server — "The classifier gets hunk headers, never patch bodies". Reuse `extractHunkHeaders(patch, 20)` (`server/src/modules/intent/domain.ts:41`).
  - server — "`pr_intent` has exactly one writer". The brief reads intent only, through `IntentRepository.getIntent` (`server/src/modules/intent/repository.ts:50`).
  - server — "MAX_CALLERS_PER_SYMBOL is a global slice" and "the ripgrep fallback is uncapped". The brief caps caller paths at 100 and the blast summary at 2,000 chars, and records the cut (F2).
  - server — "A module's ports.ts importing the repo-intel/index.js barrel adds no-circular violations". `brief/ports.ts` imports only `type`s from `@devdigest/shared`, `../intent/ports.js` and `../../ports/project-docs.js`.
  - server — "dependency-cruiser's `--ignore-known` baseline is already stale…". Exactly 8 known cycles are tolerated by `check-changed.sh` (`.claude/scripts/check-changed.sh:33-41`).
  - server — "The static pricing table…" and "PriceBook.estimate…". `cost_usd` passes through; `null` stays `null`.
  - server — "Run-driven IT tests flake…" and "`reviews.it.test.ts` … fail on a clean HEAD". Re-run on a clean worktree before blaming this change.
  - client — "Formatting a cost at fixed 4dp…". The P3 banner reuses `formatCost` (`client/src/components/run-cost-badge/index.ts:2`).
  - client — "Nested `_components/` drift: IntentCard owns styles/constants/helpers". `PrBriefCard` owns `styles.ts`, `constants.ts` and `helpers.ts`, and its `index.ts` exports named and default. Its children share the parent's files and have named-only `index.ts`.
  - client — "`MonoLink` with no `href` renders a <button>". Focus items are `next/link` `<a href>`.
  - client — "The `Icon`/`IconName` registry…". Use only existing names (`client/src/vendor/ui/icons.tsx:7-59`).
- Architecture / AGENTS.md rules:
  - Both `brief.ts` copies change together and stay byte-identical (identical today).
  - `@devdigest/shared` is type-only in the client.
  - Onion: routes → service → ports/domain ← repository. Only `container.ts` runs `new`. Services take narrow deps, never `Container`.
  - depcruise `no-cross-module-internals` (`server/.dependency-cruiser.cjs:71-81`): the brief imports only `../intent/domain.js`, `../intent/ports.js`, `../smart-diff/domain.js` (from `brief/domain.ts` only) and `../project-context/domain.js`.
  - depcruise `core-zod-type-only` (`:37-43`): the runtime model schema lives in `brief/prompt.ts`.
  - depcruise `application-no-infrastructure` (`:44-53`): the `UnifiedDiff` is built in `brief/repository.ts` with `parseUnifiedDiff` (`server/src/adapters/git/diff-parser.ts:14`).
  - `routes-no-data-access` (`:54-63`). The `pulls/routes.ts` edit (Step 8) adds one field to an existing `container.db` update; it adds no new statement. That file's baseline status is unverified (§7).
  - DB tests are `*.it.test.ts`; hermetic tests never import `test/helpers/pg.ts`.
  - Rate limit pattern: `server/src/modules/onboarding/routes.ts:44`. The global limit is off under `NODE_ENV=test` (`server/src/app.ts:110-112`).
  - Modules are registered as encapsulated plugins (`server/src/app.ts:183-185`). A content-type parser added inside `brief/routes.ts` therefore applies to brief routes only (F7c).
  - Client: `data-<thing>` test hooks; strings in `client/messages/en/brief.json`; inline `s` styles with CSS variables. Do not override the global focus ring (`client/src/vendor/ui/styles.css:213-218`).
- Do-not-touch items near this change:
  - `reviewer-core/**`;
  - `server/src/db/migrations/**` and `server/src/db/schema/**`;
  - `server/src/modules/{intent,blast,project-context}/**`;
  - `server/src/modules/pulls/**` except the single `headSha` field in Step 8;
  - `client/src/vendor/**` except the paired `shared/contracts/brief.ts`;
  - `IntentCard/**`, `BlastRadius/**` and `VerdictBanner/**`;
  - `server/clones/**`, lockfiles and `specs/**`.

## 3. Skill assignments
| Step | Skills the executing agent must read | Rules from the skill that shape this step |
|---|---|---|
| 1 | `zod` | PascalCase const plus same-named type ("type-export-schemas-and-types"). `.nullish()` vs `.nullable()` ("object-optional-vs-nullable" with the AGENTS.md mapping). Enums for fixed values ("schema-use-enums") (`zod/SKILL.md`) |
| 2 | `onion-architecture`, `security` | Pure `domain.ts`, errors subclass `AppError` (`onion-architecture/SKILL.md` "The files of a module"). Validate AI output before storing (`security/SKILL.md` ASI09) |
| 3 | `onion-architecture`, `zod`, `security` | Untrusted text only in `wrapUntrusted()` after `INJECTION_GUARD`, with max lengths (`security/SKILL.md` ASI01). Schema-validated output (`zod/SKILL.md` "parse-never-trust-json"). Runtime zod outside the core |
| 4 | `onion-architecture`, `drizzle-orm-patterns`, `zod` | Ports speak domain; the repository maps rows (`onion-architecture/SKILL.md` Checklist; `references/layers.md` "Mapping"). `safeParse` stored JSON (`zod/SKILL.md` "parse-use-safeparse"). `onConflictDoUpdate` upsert |
| 5, 6 | `onion-architecture`, `security` | Narrow deps, never `Container`; `AppError` taxonomy only (`onion-architecture/SKILL.md` Workflow 3, Checklist HIGH). Metadata-only logs (`security/SKILL.md` A09). Timeouts on external calls (`security/SKILL.md` A06) |
| 7 | `onion-architecture`, `fastify-best-practices`, `zod`, `security` | Routes call the service only (CRITICAL). Schema-first params and responses (`fastify-best-practices/SKILL.md` "Core Principles"). Rate-limit AI generation (`security/SKILL.md` A06). One import plus one entry in `modules/index.ts` |
| 8 | `onion-architecture`, `drizzle-orm-patterns` | Minimal edit inside a baselined route: do not extend violations (`onion-architecture/SKILL.md` Decision 4) |
| 9 | `drizzle-orm-patterns`, `zod` | Idempotent seed; parse the fixture with the contract |
| 10 | `frontend-ui-architecture`, `react-best-practices` | Data path `lib/api.ts` → `lib/hooks/*` → component (`references/this-repo.md` "One data path"). Server data stays in React Query |
| 11 | `frontend-ui-architecture` | One namespace file, camelCase keys, no inline strings (`references/this-repo.md` "i18n") |
| 12 | `frontend-ui-architecture`, `react-best-practices`, `security` | Domain rules in `helpers.ts` (`SKILL.md` "Anti-patterns"). Derive, don't store; `aria-live="polite"`; accessible names (`react-best-practices/SKILL.md` "Accessibility"). No raw HTML; encoded href (`security/SKILL.md` A05, "React") |
| 13 | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices` | URL state in search params (`react-best-practices/SKILL.md` "State Hygiene"); thin page |
| 14 | `frontend-ui-architecture`, `react-best-practices` | `useEffect` only for external sync (DOM scroll), with correct primitive deps (`react-best-practices/SKILL.md` "useEffect Rules"). Optional props keep existing behaviour |
| 15 | `frontend-ui-architecture`, `react-best-practices` | Reuse the route component; stateful pieces get a folder (`references/this-repo.md` "bare-file escape hatch") |
| Tests | `onion-architecture` (`references/testing.md`), `react-testing-library`, `spec-writing` (`references/ears.md`) | Fakes of ports; adapter-boundary mocks only; `*.it.test.ts` for pg. RTL: query by role and name, test behaviour |

## 4. Steps

### Step 1 — `PrBrief` contract in both vendored shared copies  (package: server + client vendored shared)
- Covers: AC1 (EC15 parse), AC6 (fields), NFR8, F2 (truncated fields); prerequisite of all later steps
- Files:
  - `server/src/vendor/shared/contracts/brief.ts`;
  - `client/src/vendor/shared/contracts/brief.ts`;
  - `client/src/lib/types.ts`.
- Context:
  - `PrBrief` is at `server/src/vendor/shared/contracts/brief.ts:171-178`, the same lines in the client copy;
  - `Risks` is at `:115-118`, `Intent` at `:9-14`, `BlastRadius` at `:91-100`, `PrHistory` at `:131-134`;
  - no runtime consumer outside the two copies; `client/src/lib/types.ts:41` re-exports `PrBrief` as a type.
- Change:
  - `Risks.risks` becomes `z.array(Risk).max(8)`.
  - Add schemas, each with a same-named type:
    - `BriefInputKind = z.enum(['intent','blast','specs','description','issue'])`;
    - `BriefMissingReason = z.enum(['absent','stale','degraded','empty','unavailable'])`;
    - `BriefMissingInput { input, reason }`;
    - `BriefReviewFocusItem { file: string, line: int().min(1), reason: string }`;
    - `BriefTruncated { files: int().min(0), description: boolean, issue_body: boolean.nullish(), callers: int().min(0).nullish(), blast_summary: boolean.nullish() }`;
    - `BriefDropped { review_focus, risks, file_refs }`, each `int().min(0)`.
  - `PrBrief` becomes:
    - `summary: string.nullish()`;
    - `intent: Intent.nullable()`;
    - `blast: BlastRadius.nullable()`;
    - `risks: Risks`;
    - `history: PrHistory.nullish()`;
    - `review_focus: array(BriefReviewFocusItem).max(8).nullish()`;
    - `head_sha`, `generated_at` (ISO-8601): `string.nullish()`;
    - `missing_inputs: array(BriefMissingInput).nullish()`;
    - `specs_used: array(string).nullish()`;
    - `truncated: BriefTruncated.nullish()`;
    - `dropped: BriefDropped.nullish()`;
    - `model: string.nullish()`;
    - `tokens_in`, `tokens_out`: `int().nullish()`;
    - `cost_usd: number.nullish()`.
  - Add a comment: "parsed from stored pr_brief.json — later fields must be `.nullish()`".
  - `client/src/lib/types.ts:41` also re-exports, as types, `Risk`, `RiskSeverity`, `BriefReviewFocusItem` and `BriefMissingInput`.
- Skills: `zod` — as in §3.
- Done when: both `brief.ts` files are byte-identical; `.claude/scripts/check-changed.sh server client` passes.
- Depends on: none
- Agent: implementer — Phase: 1

### Step 2 — Brief constants and pure domain rules  (package: server)
- Covers: AC4, AC5 (EC5, EC6, EC14, EC23), AC13 (classification), NFR2 (caps), F2, F3, F7a, F7b, F7f
- Files:
  - `NEW server/src/modules/brief/constants.ts`;
  - `NEW server/src/modules/brief/domain.ts`.
- Context:
  - `groundFindings(findings, diff)` is at `reviewer-core/src/grounding.ts:75`, re-exported at `server/src/platform/grounding.ts:6`. It drops a file not in `diff.files` or a range touching no new-side hunk line (`grounding.ts:84-123`).
  - `Finding` fields are at `server/src/vendor/shared/contracts/findings.ts:47-67`.
  - `ExternalServiceError` (502) is at `server/src/platform/errors.ts:31-35`, `ValidationError` (422) at `:25-29`.
  - `TimeoutError` is at `server/src/platform/resilience.ts:6-11`.
  - Schema-mismatch messages:
    - "OpenAI structured output failed schema validation" (`server/src/adapters/llm/openai.ts:139`);
    - "Anthropic structured output failed schema validation" (`server/src/adapters/llm/anthropic.ts:154`);
    - "OpenRouter structured output failed schema validation for …" (`reviewer-core/src/llm/openrouter.ts:115`).
  - The issue reference rule is at `server/src/adapters/github/octokit.ts:130`.
  - `classifyFile(path)` is at `server/src/modules/smart-diff/domain.ts:7`.
  - Pattern: `server/src/modules/onboarding/domain.ts`.
- Change:
  - `constants.ts`:
    - `BRIEF_MAX_FILES = 300`;
    - `BRIEF_HUNKS_PER_FILE = 20`;
    - `BRIEF_DESCRIPTION_MAX_CHARS = 8_000`;
    - `BRIEF_ISSUE_BODY_MAX_CHARS = 4_000`;
    - `BRIEF_TITLE_MAX_CHARS = 500`;
    - `BRIEF_INTENT_MAX_CHARS = 4_000` (mirrors `reviewer-core/src/prompt.ts:55`);
    - `BRIEF_BLAST_SUMMARY_MAX_CHARS = 2_000`;
    - `BRIEF_MAX_CALLER_PATHS = 100`;
    - `BRIEF_PROMPT_TOKEN_BUDGET = 40_000`;
    - `BRIEF_MAX_RISKS = 8`;
    - `BRIEF_MAX_FOCUS = 8`;
    - `BRIEF_LLM_TIMEOUT_MS = 90_000`;
    - `BRIEF_ISSUE_TIMEOUT_MS = 5_000`;
    - `BRIEF_MAX_OUTPUT_TOKENS = 5_000` (F3);
    - `BRIEF_GENERATE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const`.
  - `domain.ts` exports:
    - `linkedIssueNumber(body): number | null` (the `octokit.ts:130` rule).
    - `computeMissingInputs({ intent, prHeadSha, blast, blastFailed, specsIncluded, description, issue }): BriefMissingInput[]`, in a fixed order:
      1. intent `absent` or `stale` (`headSha !== prHeadSha`; null counts as stale);
      2. blast `unavailable` (the read threw) or `degraded`;
      3. specs `absent` when 0 are included;
      4. description `empty` when null or whitespace;
      5. issue `absent`.
    - `buildPromptFiles(rows: { path; additions; deletions; hunks }[]): { files: (row & { role: SmartDiffRole })[]; leftOut: number }`:
      - sorts by `additions + deletions` descending, then path ascending;
      - slices to `BRIEF_MAX_FILES`;
      - sets `role = classifyFile(path)`.

      This moves role assignment out of the service (F7a).
    - `capCallerPaths(blast: BlastRadius | null): { summary: string | null; callerFiles: string[]; summaryCut: boolean; callersLeftOut: number }`:
      - distinct `downstream[].callers[].file` in first-seen order, sliced to 100;
      - the summary sliced to 2,000 chars.
    - `parseFileRef(ref): { path; range }`: splits a trailing `:N` or `:N-M`.
    - `groundBrief(output, { diff, prPaths, callerPaths: Set | null }): { risks; reviewFocus; dropped }`.
      - **Focus:**
        1. dedupe by `(file, line)`, keeping the first;
        2. map to `Finding`s (`id: focus-<i>`, `start_line = end_line = line`, `severity 'SUGGESTION'`, `category 'bug'`, `confidence 1`, `kind null`, empty title and rationale);
        3. `groundFindings(…, diff)`;
        4. keep survivors in model order, then slice to 8.

        `dropped.review_focus` = duplicates + grounding drops + cap drops.
      - **Risks:**
        1. dedupe identical refs inside a risk;
        2. keep refs whose path is in `prPaths`, or in `callerPaths` when that set is non-null;
        3. `dropped.file_refs` = removed duplicates + ungrounded refs;
        4. drop a risk with no ref left (`dropped.risks`);
        5. slice the survivors to 8; cap drops add to `dropped.risks` only, and their refs are not counted in `file_refs` (§0 gap 6).
    - `classifyLlmFailure(err)`:
      - `err.name === 'TimeoutError' || err.name === 'APIConnectionTimeoutError'` → `timeout`;
      - `err.message` matches `/structured output failed schema validation/` → `schema_mismatch`;
      - anything else → `provider_error` (F7b).
    - `briefGenerationError(reason)` → `new ExternalServiceError('Brief generation failed', { reason })`; the details never include `raw`.
    - `noFilesError()` → `new ValidationError('The pull request has no changed files', { reason: 'no_files' })`.
- Skills: `onion-architecture`, `security`.
- Done when: `tsc --noEmit` passes; depcruise is clean. `domain.ts` imports only types, `../../platform/errors.js`, `../../platform/grounding.js`, `../smart-diff/domain.js` and `./constants.js`.
- Depends on: 1
- Agent: implementer — Phase: 1

### Step 3 — Prompt assembly, explicit budget path, model schema, system prompt  (package: server)
- Covers: AC3, NFR2 (EC12, EC13), NFR4 (EC17), F2, F3
- Files:
  - `NEW server/src/modules/brief/prompt.ts`;
  - `NEW server/src/prompts/brief.system.md`.
- Context:
  - `wrapUntrusted` and `INJECTION_GUARD` come from `@devdigest/reviewer-core` (`reviewer-core/src/index.ts:15-26`; `reviewer-core/src/prompt.ts:18,45-49`);
  - pattern: `server/src/modules/onboarding/prompt.ts:1-80` (labelled blocks, linear fit, no array bounds in the model schema, comment `:18-22`);
  - token estimate is `ceil(chars/4)` (`server/src/ports/project-docs.ts:22`).
- Change:
  - `BriefModelOutput = z.object({ summary: z.string(), risks: z.array(Risk), review_focus: z.array(z.object({ file: z.string(), line: z.number().int(), reason: z.string() })) })`. It has no array bounds and no `min`.
  - `BriefFacts`:
    - `title`;
    - `description`;
    - `issue: { number; title; body } | null`;
    - `intent: { intent; in_scope; out_of_scope; change_type } | null`;
    - `blast: { summary; callerFiles } | null`, already capped by `capCallerPaths`;
    - `files`, from `buildPromptFiles`;
    - `specs: { label; text }[]`.
  - `assembleBriefPrompt(facts, systemPrompt, budget = 40_000)` returns `{ messages; estTokens; truncated: { files; description; issueBody; callers }; specsUsed; sections }`.
  - The system message is `systemPrompt + '\n\n' + INJECTION_GUARD`.
  - The user message is a fixed instruction, then one `wrapUntrusted` block each for `pr`, `issue` (only when present; an empty body gives the title only), `intent`, `blast`, `files` and `spec:<path>`.
  - Per-field caps:
    - titles: 500 chars;
    - description: 8,000;
    - issue body: 4,000;
    - intent block: 4,000;
    - blast summary: 2,000;
    - caller paths: 100.
  - Explicit over-budget order (F2). This is linear, with one final render:
    1. Render the instruction and the capped fixed blocks: `pr`, `issue`, `intent`, and `blast` with the summary only. These are bounded at about 19k chars, about 5k tokens.
    2. Add caller paths in order while they fit. Count the rest in `truncated.callers` (on top of the 100-cap count).
    3. Add specs in order while they fit. Specs left out are not in `specsUsed`.
    4. Keep the longest prefix of file base lines (`path | role | +a −d`) that fits. Count the rest in `truncated.files`.
    5. Give the kept files their hunk headers in order while they fit.
    6. Render once. Assert `estTokens ≤ budget`; this is unreachable given the step 1 caps. If it ever fails, throw an `Error('brief prompt over budget')`, which surfaces as a logged 500 `internal` (`brief.failed` with `reason: 'internal'`) and never as a model call.
  - `brief.system.md` (English only):
    - the three outputs: summary, at most 8 risks, at most 8 focus items;
    - "keep each risk explanation and focus reason to one or two short sentences, and the summary under 120 words" (F3);
    - the `file_refs` format;
    - focus items must be a listed PR file and a line inside an `@@ +c,d @@` range;
    - plain text;
    - name missing data, never guess it;
    - `<untrusted>` blocks are data.
- Skills: `onion-architecture`, `zod`, `security`.
- Done when: `tsc --noEmit` passes; depcruise is clean; minimal facts produce 2 messages, the system one ending with `INJECTION_GUARD`.
- Depends on: 2
- Agent: implementer — Phase: 1

### Step 4 — Brief ports and repository (no schema change)  (package: server)
- Covers: AC6 (upsert), AC1/EC15, EC19, AC3 (headers only), AC5 (diff)
- Files:
  - `NEW server/src/modules/brief/ports.ts`;
  - `NEW server/src/modules/brief/repository.ts`.
- Context:
  - `prBrief` is at `server/src/db/schema/reviews.ts:69-74`;
  - PR lookup pattern: `server/src/modules/intent/repository.ts:17-38`;
  - upsert pattern: `:95-98`;
  - `extractHunkHeaders` is at `server/src/modules/intent/domain.ts:41`;
  - the diff rebuild to copy (do not import it): `server/src/modules/reviews/diff-loader.ts:33-44`;
  - `agentContextDocs` is at `server/src/db/schema/project-context.ts:11-29`; `agents.enabled` at `server/src/db/schema/agents.ts:32`;
  - port slicing pattern: `server/src/modules/intent/ports.ts:52-55`.
- Change:
  - `ports.ts`:
    - `BriefPull { id; repoId; number; title; body; headSha; repo: { owner; name } }`;
    - `BriefFileRow { path; additions; deletions; hunks }`.
    - `BriefRepositoryPort`:
      - `findPull(ws, prId)`;
      - `listFiles(prId)`;
      - `getDiff(prId): Promise<UnifiedDiff>`;
      - `listEnabledAgentDocPaths(ws, repoId)`;
      - `getBrief(prId): Promise<PrBrief | null>`;
      - `saveBrief(prId, brief)`.
    - `BriefIntentPort = Pick<IntentRepositoryPort, 'getIntent'>`.
    - `BriefBlastPort { get(ws, prId): Promise<BlastRadius> }`.
    - `BriefIssuePort { getIssue(repo: RepoRef, n): Promise<IssueMeta> }`.
    - `BriefDocsPort = Pick<ProjectDocsPort, 'read'>`.
    - `BriefLogPort { info; warn }`.
  - `repository.ts`:
    - `findPull` is workspace-scoped and joins `repos`;
    - `listFiles` returns `extractHunkHeaders(patch, 20)` and never the patch;
    - `getDiff` uses `parseUnifiedDiff` over the rebuilt patches;
    - `listEnabledAgentDocPaths` filters by workspace and enabled agents, ordered by `agents.createdAt`, `agents.id`, `position`;
    - `getBrief` uses `safeParse` and returns null when the JSON fails;
    - `saveBrief` upserts on `prId`.
- Skills: `onion-architecture`, `drizzle-orm-patterns`, `zod`.
- Done when: `tsc --noEmit` passes; depcruise is clean (only the 8 known cycles).
- Depends on: 1, 2
- Agent: implementer — Phase: 1

### Step 5 — BriefService (part 1): read and fact gathering  (package: server)
- Covers: AC3 (fact gathering), AC4, AC9 (GET reads only), NFR2 (EC13), EC22, EC23, F7e
- Files: `NEW server/src/modules/brief/service.ts`
- Context:
  - deps pattern: `server/src/modules/onboarding/service.ts:46-57`;
  - `orderCandidates` is at `server/src/modules/project-context/domain.ts:49` and `buildProjectContext` at `:78`;
  - `ProjectDocsPort.read` enforces 64 KB (`server/src/ports/project-docs.ts:11,135`);
  - `withTimeout(p, ms)` is at `server/src/platform/resilience.ts:13`;
  - `PrIntentRecord` is at `server/src/vendor/shared/contracts/review-api.ts:66-80`.
- Change:
  - `BriefServiceDeps { repo; intent; blast; issues; docs; llm: (p: Provider) => Promise<LLMProvider>; resolveModel: (ws) => Promise<FeatureModelChoice>; systemPrompt: () => Promise<string>; now?; limits?: Partial<{ llmTimeoutMs; issueTimeoutMs }> }`.
  - `get(ws, prId)` throws `NotFoundError` when the PR is missing, or when there is no brief or it does not parse. It makes no model, blast or GitHub call.
  - `private gatherFacts(ws, pull, files)` runs these in parallel with `Promise.all`:
    - `intent.getIntent`;
    - `blast.get`, caught: a throw gives null and `blastFailed`;
    - the issue: `linkedIssueNumber(body)`, then `withTimeout(issues.getIssue(pull.repo, n), issueTimeoutMs ?? 5_000)`, caught: any error or timeout gives null;
    - the specs: `orderCandidates(dedupe(paths), [])`, each read with `docs.read` (a throw becomes missing), then `buildProjectContext`.

    It returns `BriefFacts` (built with `buildPromptFiles`, `capCallerPaths` and the per-field caps), plus `missingInputsArgs` and `truncatedSoFar` (files over 300, callers over 100, summary cut).
- Skills: `onion-architecture`, `security`.
- Done when: `tsc --noEmit` passes; depcruise is clean. `service.ts` imports only types, `./ports.js`, `./domain.js`, `./prompt.js`, `./constants.js`, `../project-context/domain.js` and `../../platform/{errors,resilience}.js` (F7a: no `../smart-diff/domain.js` here).
- Depends on: 2, 3, 4
- Agent: implementer — Phase: 2

### Step 6 — BriefService (part 2): generate (one call, join, ground, store, log)  (package: server)
- Covers: AC2, AC5, AC6, AC13, AC15, AC16, NFR1, NFR6, EC10
- Files: `server/src/modules/brief/service.ts`
- Context:
  - join pattern: `server/src/modules/onboarding/service.ts:85,130-143`;
  - single-call pattern: `:315-337`;
  - `ConfigError` comes from the provider factory (`server/src/platform/container.ts:388,396,404`);
  - `StructuredResult` is at `server/src/vendor/shared/adapters.ts:72-80`.
- Change: `generate(ws, prId, { logger })`:
  1. `findPull`, or `NotFoundError`.
  2. If an in-flight entry exists, return the same promise. Otherwise set the entry synchronously, with no `await` in between, and clear it in `finally` by identity (AC15, EC10).
  3. `run`:
     1. `listFiles`. If 0, warn `brief.failed` (`no_files`) and throw `noFilesError()` (AC16).
     2. `resolveModel`, then `deps.llm(provider)`. A `ConfigError` is logged (`config_error`) and rethrown.
     3. `gatherFacts`.
     4. `assembleBriefPrompt`.
     5. `computeMissingInputs`.
     6. Exactly one `withTimeout(llm.completeStructured({ model, schema: BriefModelOutput, schemaName: 'PrBrief', messages, maxTokens: 5_000, timeoutMs, maxRetries: 0, temperature: 0 }), timeoutMs)`. A throw is logged with `classifyLlmFailure` and becomes `briefGenerationError(reason)`. Nothing is stored.
     7. `groundBrief` with `getDiff`, all PR paths, and the capped caller set (null when blast is null).
     8. Build the `PrBrief` (fields as in Step 1; `history: null`; `head_sha: pull.headSha`; the full `truncated`), then `saveBrief`.
     9. One `info` `brief.generated` with `pr_id`, `llm_calls: 1`, `model`, `tokens_in`, `tokens_out`, `cost_usd`, the input counts, `missing_inputs`, `truncated`, `dropped` and `duration_ms`.
  4. Each failure writes exactly one `warn` `brief.failed` `{ event, pr_id, reason }`. An unexpected error logs `internal` and rethrows.
- Skills: `onion-architecture`, `security`.
- Done when: `tsc --noEmit` passes; depcruise is clean; the import list is the same as in Step 5.
- Depends on: 5
- Agent: implementer — Phase: 2

### Step 7 — Routes, container wiring, registry  (package: server)
- Covers: AC1, AC2, AC9, AC13, AC16, NFR3, NFR7, F4 (wiring), F7c, F7i
- Files:
  - `NEW server/src/modules/brief/routes.ts`;
  - `server/src/modules/index.ts`;
  - `server/src/platform/container.ts`.
- Context:
  - route patterns: `server/src/modules/blast/routes.ts:11-24` and `server/src/modules/onboarding/routes.ts:41-51`;
  - `IdParams` is at `server/src/modules/_shared/schemas.ts:11`;
  - registry: `server/src/modules/index.ts:1-47`;
  - memoized getter pattern: `container.ts:273-283`;
  - getters to wire:
    - `resolveFeatureModelFor` (`:202-215`);
    - `llmSingleShot` (`:375-379`);
    - `intentRepo` (`:217-219`);
    - `blastService` (`:235-237`);
    - `projectDocs` (`:244-252`);
    - `github()` (`:351-358`);
  - modules are encapsulated plugins (`server/src/app.ts:183-185`);
  - `apiFetch` sends a content-type only with a body (`client/src/lib/api.ts:26-31`).
- Change:
  - `routes.ts` takes `const service = container.briefService` once, then:
    - adds an encapsulated `app.addContentTypeParser('application/json', { parseAs: 'string' }, …)` that returns `undefined` for an empty or whitespace-only body and otherwise does `JSON.parse` (a parse error → 400) (F7c);
    - `GET /pulls/:id/brief` with `{ params: IdParams, response: { 200: PrBrief } }`;
    - `POST /pulls/:id/brief` with `{ params: IdParams, response: { 200: PrBrief } }` (F7i), `config: { rateLimit: BRIEF_GENERATE_RATE_LIMIT }`, and no body schema → `service.generate(ws, id, { logger: req.log })`.
  - Container: `private _briefService?` and a memoized `get briefService()` with these deps:
    - `repo: new BriefRepository(this.db)`;
    - `intent: this.intentRepo`;
    - `blast: this.blastService`;
    - `issues: { getIssue: async (r, n) => (await this.github()).getIssue(r, n) }`;
    - `docs: this.projectDocs`;
    - `llm: (p) => this.llmSingleShot(p)`;
    - `resolveModel: (ws) => this.resolveFeatureModelFor(ws, 'risk_brief')`;
    - `systemPrompt: () => loadPromptTemplate('brief.system.md')`.
  - Registry: one import and one entry, `brief`.
- Skills: `onion-architecture`, `fastify-best-practices`, `zod`, `security`.
- Done when:
  - `.claude/scripts/check-changed.sh server --full` passes (only the 8 known cycles);
  - `POST` with `content-type: application/json` and an empty body is not rejected with 400.
- Depends on: 6
- Agent: implementer — Phase: 2

### Step 8 — Persist the live head SHA on PR detail refresh (F1)  (package: server)
- Covers: AC6 (`json.head_sha` equals `PrDetail.head_sha` with a token), AC10 (no false stale after generation)
- Files: `server/src/modules/pulls/routes.ts`
- Context:
  - the token path's update `.set({ body, additions, deletions, filesCount })` is at `server/src/modules/pulls/routes.ts:295-305`;
  - polling already writes `headSha: pr.head_sha` (`server/src/modules/polling/routes.ts:42,53`);
  - status derivation compares `headSha` with `lastReviewedSha` (`server/src/modules/pulls/status.ts:51`);
  - `MockGitHubClient.getPullRequest` takes `opts.detail` overrides (`server/src/adapters/mocks.ts:159-186`).
- Change: add `headSha: detail.head_sha` to that `.set({...})`. Nothing else in the file changes.
- Skills: `onion-architecture`, `drizzle-orm-patterns` — a minimal edit that adds no new violation.
- Done when: `.claude/scripts/check-changed.sh server` passes; the onion gate shows no new `container.db` finding.
- Depends on: none
- Agent: implementer — Phase: 2

### Step 9 — Seeded, grounded brief for PR #482 (NFR11)  (package: server)
- Covers: NFR11; §0 gap 7
- Files:
  - `NEW server/src/db/seed-brief.ts`;
  - `server/src/db/seed.ts`.
- Context:
  - PR #482 is inserted only when absent (`server/src/db/seed.ts:100-182`), with head `'a1b2c3d4e5f6'` (`:116`);
  - its files have no patch (`:126-131`); `src/config.ts` has `additions: 4`;
  - the findings are at `:157-180`;
  - helper precedent: `server/src/db/seed-skills.ts:295`.
- Change:
  - Give the seeded `src/config.ts` a patch with one hunk, `@@ -8,3 +8,7 @@`: 3 context lines plus 4 additions, so line 12 is covered. Avoid the secret patterns at `.claude/skills/security/SKILL.md:182-193`.
  - `seed-brief.ts`: `SEED_PR_482_BRIEF`, validated with `PrBrief.parse`, and `seedBrief(db, prId)` with `onConflictDoNothing`.
  - The fixture:
    - a summary;
    - 2 risks with refs `src/config.ts:10-13` and `src/api/users.ts`;
    - 1–2 focus items on `src/config.ts`, lines within 8–14;
    - the seeded `head_sha`, a fixed `generated_at`, `model: 'seed'`;
    - null `intent`, `blast`, `history` and cost;
    - `missing_inputs`: intent absent, blast unavailable, specs absent, issue absent;
    - zero `truncated` and `dropped`.
  - Call `seedBrief` inside `if (!pr)`.
- Skills: `drizzle-orm-patterns`, `zod`.
- Done when: `tsc --noEmit` passes; `check-changed.sh server` passes.
- Depends on: 1
- Agent: implementer — Phase: 2

### Step 10 — Client data hooks  (package: client)
- Covers: AC9, AC11, AC1 (404 → null)
- Files:
  - `NEW client/src/lib/hooks/brief.ts`;
  - `client/src/lib/hooks/index.ts`.
- Context:
  - pattern: `client/src/lib/hooks/intent.ts:9-32`;
  - `ApiError` is at `client/src/lib/api.ts:8-19`;
  - mutations always toast (`client/src/lib/providers.tsx:41-43`).
- Change:
  - `briefQueryKey(prId)`;
  - `useBrief(prId)`: 404 → `null`, `retry: false`;
  - `useGenerateBrief(prId)`: POST with no body; `onSuccess` calls `setQueryData`;
  - `import type` only;
  - add the barrel export.
- Skills: `frontend-ui-architecture`, `react-best-practices`.
- Done when: `check-changed.sh client` passes.
- Depends on: 1
- Agent: implementer — Phase: 3a

### Step 11 — i18n namespace `brief`  (package: client)
- Covers: NFR10, F7j
- Files: `client/messages/en/brief.json`
- Context: the current keys are at `client/messages/en/brief.json:1-19`. No client code uses the `brief` namespace (grep).
- Change:
  - Keep `block.intent`, `block.blast`, `block.history`, `noRisks`, `noHistory`, `overlap` and `why.*`.
  - Set `block.risks` to "Risk areas".
  - **Remove** `unavailable` and `unavailableHint` (F7j).
  - Add:
    - `title`;
    - `block.summary`, `block.reviewFocus`;
    - `generate`, `refresh`, `generating`;
    - `empty`, `emptyPr`;
    - `stale`;
    - `generatedAt`;
    - `missing.title`, `missing.input.*`, `missing.reason.*`;
    - `severity.{high,medium,low}`;
    - `error.{generic,noKey,rateLimited}`;
    - `settingsLink`, `retry`;
    - `focusItem`;
    - P3: `meta.cost`, `meta.tokens`, `risk.expand`.
- Skills: `frontend-ui-architecture`.
- Done when: the JSON is valid; every key used in Steps 12 and 15 exists.
- Depends on: none
- Agent: implementer — Phase: 3a

### Step 12 — PrBriefCard: states, summary, Risk areas, Review focus links  (package: client)
- Covers: AC1, AC7, AC9, AC10, AC11, AC12, AC14, AC16, AC8 (links), NFR5, NFR9, EC16, F7d
- Files, under `.../pulls/[number]/_components/OverviewTab/_components/PrBriefCard/`:
  - `NEW PrBriefCard.tsx`;
  - `styles.ts` (with `overflowWrap: "anywhere"`);
  - `constants.ts` (`SEVERITY_META`: high → `AlertOctagon`, medium → `AlertTriangle`, low → `Info`; match the CSS variable names in `VerdictBanner/constants.ts`);
  - `helpers.ts`:
    - `isStale(brief, headSha)`;
    - `briefErrorKind(err)`: 429 → `rateLimited`; `config_error` → `noKey`; anything else → `generic`;
    - `reviewFocusHref(repoId, prNumber, file, line)`: null unless `line` is an integer ≥ 1; otherwise built with `URLSearchParams`;
  - `index.ts` (named + default);
  - `_components/RiskRow/{RiskRow.tsx,index.ts}`: a `<span role="img" aria-label=… data-risk-severity>` icon, the title, and the refs as mono text;
  - `_components/ReviewFocusList/{ReviewFocusList.tsx,index.ts}`: an `<ol>` of `next/link` items with `data-review-focus`; an item whose href is null renders as text.
- Context:
  - card pattern: `OverviewTab/_components/IntentCard/IntentCard.tsx:105-139`;
  - `IconBtn` has no `disabled` (`client/src/vendor/ui/primitives/IconBtn.tsx:4-18`), so refresh is a `Button size="sm" icon="RefreshCw" aria-label title disabled` (`client/src/vendor/ui/primitives/tokens.ts:24-35`);
  - link pattern: `client/src/app/repos/[repoId]/onboarding/_components/OnboardingView/_components/StatusNotes/StatusNotes.tsx:4`;
  - global focus ring: `client/src/vendor/ui/styles.css:213-218`.
- Change: `PrBriefCard({ prId, repoId, prNumber, headSha, hasFiles, latestReview })` renders `<section data-pr-brief>`:
  - **Loading:** a `Skeleton`.
  - **No brief:** the `empty` hint and an enabled primary Generate button. With `!hasFiles` the button is disabled and the hint is `emptyPr`.
  - **Brief shown:**
    - header: title, `generatedAt`, refresh;
    - the summary as `<p>` text;
    - Risk areas (or `noRisks`);
    - Review focus;
    - the missing-inputs notes.
  - **Live region (F7d):** one `<div aria-live="polite" data-brief-status>`, **always mounted** (empty when idle). It holds the `generating`, `stale` and `error.<kind>` texts as they apply, so a screen reader announces each change.
  - **Pending:** Generate, refresh and Retry are disabled.
  - **Error:** Retry; `noKey` adds a link to `/settings`; the earlier brief stays shown.
  - Never set `outline: none` or override `:focus-visible`. Links and buttons keep the global focus ring (F7d).
  - No `dangerouslySetInnerHTML`, no Markdown, and no `mutate` on render or in an effect.
- Skills: `frontend-ui-architecture`, `react-best-practices`, `security`.
- Done when: `check-changed.sh client` passes.
- Depends on: 10, 11
- Agent: implementer — Phase: 3a

### Step 13 — Overview placement and page wiring  (package: client)
- Covers: AC1 (order), AC8 (URL → DiffTab), AC16 (`hasFiles`), NFR8, F7g (banner source)
- Files:
  - `.../OverviewTab/OverviewTab.tsx`;
  - `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`.
- Context:
  - `OverviewTab.tsx:9-30`;
  - `page.tsx:61-69` (tab state), `:74` (`runs`, newest first), `:143-151`, `:178-185`.
- Change:
  - `OverviewTab` gets `prNumber`, `hasFiles` and `latestReview: ReviewRecord | null`. It renders `PrBriefCard` first, then `IntentCard`, `BlastRadius`, and the Description.
  - The page passes:
    - `latestReview={runs.find((r) => r.verdict != null) ?? null}` — the newest review that has a verdict, so a `summary`-kind run without a verdict is skipped (F7g);
    - `hasFiles={pr.files.length > 0}`;
    - `prNumber={pr.number}`;
    - `focusFile={search.get("file")}` and `focusLine={search.get("line")}` to `DiffTab`.
  - `setTab` also deletes `file` and `line`.
- Skills: `frontend-ui-architecture`, `next-best-practices`, `react-best-practices`.
- Done when: `check-changed.sh client --full` passes (end of Phase 3a); in dev, the seeded PR #482 Overview shows the card first.
- Depends on: 12
- Agent: implementer — Phase: 3a

### Step 14 — Files changed focus: expand, scroll once, highlight, header fallback  (package: client)
- Covers: AC8, EC18, NFR5, NFR8, F6
- Files:
  - `.../DiffTab/DiffTab.tsx`;
  - `.../DiffTab/helpers.ts` (`parseDiffFocus`);
  - `.../DiffTab/_components/RoleGroup/RoleGroup.tsx`;
  - `client/src/components/diff-viewer/{DiffViewer/DiffViewer.tsx,FileCard/FileCard.tsx,CodeLine/CodeLine.tsx,styles.ts,index.ts}`.
- Context:
  - `DiffTab.tsx:14-20,26,66-99` (`useSmartDiff` gives `smart`; flat until loaded);
  - `RoleGroup.tsx:29-30,47`;
  - `DiffViewer.tsx:28-34`;
  - `FileCard.tsx:46-48,78-104,110-120`;
  - `CodeLine.tsx:59`;
  - `Line` is at `client/src/components/diff-viewer/helpers.ts:4-9`.
- Change:
  - `DiffFocus = { file: string; line: number | null }`.
  - `parseDiffFocus(file, line)` keeps `line` only when it is a positive integer.
  - **DiffTab:**
    - passes the focus down only after the Smart Diff query has settled (`useSmartDiff` loaded or errored), so FileCards do not scroll in the flat list and then remount inside groups (F6);
    - ignores a focus whose file is not in `files` (EC18);
    - keeps `const scrolledKey = useRef<string | null>(null)` and passes `focus` plus a stable `claimScroll(key): boolean` (`useCallback`). It returns true only the first time a given `file:line` key is claimed, so the scroll runs once per (file, line) pair across re-renders and remounts.
  - **RoleGroup:** force-open when it holds the focus file.
  - **FileCard:**
    - starts open when focused, with `data-focus-file`;
    - holds `headerRef` and a ref to the focused `CodeLine` row (passed as a `ref` prop, React 19), never `querySelector`;
    - runs a `useEffect` keyed on the **primitives** `[focusFile, focusLine, lines.length]`: when this file is the focus and `claimScroll` returns true, it scrolls the line ref if a non-`del` line has `newNo === line`, otherwise the header ref.
  - **CodeLine:** gets `focused` and a `ref`, and renders `data-focus-line` plus a highlight style.
  - Nothing changes when there is no focus.
- Skills: `frontend-ui-architecture`, `react-best-practices`.
- Done when: `check-changed.sh client` passes and the existing `DiffTab.test.tsx` is green.
- Depends on: 13
- Agent: implementer — Phase: 3b

### Step 15 — P3: verdict banner and risk expansion (optional, deferrable)  (package: client)
- Covers: AC17, AC18, EC20
- Files: `PrBriefCard.tsx`, `PrBriefCard/helpers.ts` (`latestVerdictInfo`), `_components/RiskRow/RiskRow.tsx`
- Context:
  - `VerdictBanner` is at `.../_components/VerdictBanner/VerdictBanner.tsx:12-26`;
  - the blocker rule is at `ReviewRunAccordion.tsx:56`;
  - `ReviewRecord.verdict` and `score` are nullable (`client/src/vendor/shared/contracts/review-api.ts:36-42`);
  - `formatCost` is at `client/src/components/run-cost-badge/helpers.ts:22-28`.
- Change:
  - `latestVerdictInfo(review)` returns `{ verdict, score, findingsCount, blockers }`, where blockers are CRITICAL findings without `dismissed_at`. It returns null for no review or a null verdict.
  - The card renders `VerdictBanner` with `summary={null}` above the summary.
  - A meta line shows `formatCost(brief.cost_usd)` (null → "—") and `tokens_in → tokens_out`.
  - `RiskRow` gets a toggle `<button aria-expanded aria-label={t("risk.expand",{title})}>`, collapsed by default, that shows the explanation as text.
  - **Deferrable:** if skipped, AC17/AC18 are marked deferred in plan-verifier, and no P1 AC is affected.
- Skills: `frontend-ui-architecture`, `react-best-practices`.
- Done when: `check-changed.sh client --full` passes.
- Depends on: 12, 13
- Agent: implementer — Phase: 3b

## 5. Test plan
- Existing suites to run:
  - per step: `.claude/scripts/check-changed.sh server` / `client`; `--full` at the end of each phase;
  - `--it` runs NEW `brief.it.test.ts` plus the seed-using suites `smart-diff`, `blast`, `reviews`, `integration` and `pulls-comments` `.it.test.ts` (Steps 8 and 9 touch the seed and `pulls/routes.ts`);
  - e2e: `cd e2e && npm run typecheck` (flows need `./scripts/e2e.sh`, see §7).
- Tests to add or change (owner: test-writer):
  - `server/test/contracts.test.ts` — NFR8, EC15, F2. Lane: hermetic. It asserts:
    - a full fixture parses, including `truncated.callers` and `truncated.blast_summary`;
    - minimal old JSON parses;
    - 9 risks or 9 focus items fail;
    - `line: 0` fails;
    - an unknown reason fails;
    - the two `brief.ts` files are byte-identical (pattern at `server/test/contracts.test.ts:391-403`).
  - NEW `server/test/brief-domain.test.ts` — AC4, AC5, AC13, NFR2, EC5, EC6, EC14, EC22, EC23, F2, F7b, F7f. Lane: hermetic. It asserts:
    - the AC5 exact fixture → 1 kept risk and `dropped {3,1,1}`; with null callers, `risks 2, file_refs 2`;
    - EC6 (file without a patch);
    - EC14: 10 grounded items → 8 kept, 2 dropped;
    - F7f:
      - two identical (file, line) items → 1 kept and 1 counted;
      - 10 risks → 8 kept, `dropped.risks` +2, and `file_refs` does not include the capped risks' refs;
      - duplicate refs inside one risk count in `file_refs`;
    - the `parseFileRef` cases;
    - the `computeMissingInputs` truth table;
    - F7b: `TimeoutError` and `APIConnectionTimeoutError` → timeout; the three exact provider messages → schema_mismatch; a message merely containing "schema" (for example "invalid schema name") → provider_error; `details` deep-equals `{ reason }`;
    - `linkedIssueNumber`;
    - `buildPromptFiles`: order, the 300 cap with `leftOut`, roles;
    - F2: `capCallerPaths` with 5,000 callers (500 distinct files) → 100 paths and `callersLeftOut = 400`; a 10,000-char summary → 2,000 and `summaryCut`.
  - NEW `server/test/brief-prompt.test.ts` — AC3, NFR2, NFR4, EC12, EC17, F2, F3. Lane: hermetic. It asserts:
    - AC3: the blocks per label; `@@` headers present; hunk body lines absent;
    - the system message ends with `INJECTION_GUARD`;
    - NFR4: injection fixtures stay inside their blocks, escaped;
    - the caps: description 8,000, issue 4,000, 20 hunks, 350 files → `truncated.files ≥ 50`;
    - F2 over-budget fixture: 5,000 callers, 300 files with 20 long hunks each, 24k-token specs, max-length description, issue and intent → `estTokens ≤ 40_000`, a non-zero `truncated.callers`/`files` as applicable, and `specsUsed` listing only included specs;
    - EC22: an empty issue body gives the title only;
    - F3: the system prompt file contains the short-explanation instruction;
    - `toJsonSchema(BriefModelOutput)` has no `minItems`, `maxItems` or `minimum`.
  - NEW `server/test/brief-service.test.ts` — fakes of every port. AC2, AC4, AC5, AC13, AC15, AC16, NFR1, NFR6, EC10, EC13, EC22, EC23, F7e. Lane: hermetic. It asserts:
    - one `completeStructured` call with the `risk_brief` model, `maxRetries: 0`, `timeoutMs: 90000` and `maxTokens: 5000`;
    - the control-case fake that throws on a second call;
    - AC4 → 1 call;
    - AC13: each reason, `config_error` rethrown, `saveBrief` never called;
    - AC15 join;
    - AC16 → 0 calls;
    - EC13 `specs_used`;
    - F7e: a `getIssue` that never resolves with `limits.issueTimeoutMs: 20` → `{issue,absent}`, and generation finishes; the issue, blast and intent fakes are called concurrently (a gate shows all three started before any resolved);
    - EC23;
    - NFR6: exactly one `info`/`warn` per path; no text, path or summary in any record.
  - NEW `server/test/brief-wiring.test.ts` (F4) — AC2, NFR1. Lane: hermetic. Pattern: `server/test/llm-single-shot.test.ts:1-60`, with `vi.mock` of `@devdigest/reviewer-core`'s `OpenRouterProvider` constructor and `MockSecretsProvider` keys. It asserts:
    - a `Container` without `llm` overrides is built;
    - `const deps = (c.briefService as unknown as { deps: BriefServiceDeps }).deps`;
    - `vi.spyOn(c, 'llm')` and `vi.spyOn(c, 'llmSingleShot')`;
    - `await deps.llm('openrouter')` → `llmSingleShot` called once, `llm` not called, and the OpenRouter constructor options have `maxRetries: 0` and `timeoutMs: 90_000`;
    - `await deps.llm('openai')` → the instance's `transportRetries` is `0`;
    - `c.briefService === c.briefService` (memoized, so the join works).
  - NEW `server/test/brief.it.test.ts` — AC1, AC6, AC9, AC10, AC13, AC16, NFR3, NFR7, EC15, EC19, F1, F7c. Lane: it. It asserts:
    - 404 with no row;
    - two POSTs → one row with the matching `head_sha`;
    - 20 GETs → 0 calls and p95 ≤ 300 ms;
    - a failure → 502 with the row unchanged (`json::text` equal); no key → 500;
    - no files → 422 with 0 calls;
    - a corrupt row → 404;
    - cascade on PR delete;
    - another workspace → 404; a non-uuid id → 422;
    - **F1 token path:**
      - an app with `github: new MockGitHubClient({ detail: { head_sha: 'live-sha-2' } })`, on a PR stored with `headSha: 'old-sha'`;
      - `GET /pulls/:id` → body `head_sha` is `live-sha-2` and the DB row's `head_sha` is `live-sha-2`;
      - then a POST brief → `json.head_sha === 'live-sha-2'` (AC6, no false AC10 stale);
    - **F7c:** `POST` with `content-type: application/json` and an empty payload → 200 (not 400); `{}` → 200; invalid JSON → 400;
    - NFR3: in its own app (`NODE_ENV: 'development'`, `API_HOST: '127.0.0.1'`, a gated provider), the 11th POST → 429, and GET is not limited at 10.
  - NEW `PrBriefCard/PrBriefCard.test.tsx` — AC1, AC7, AC8, AC9, AC10, AC11, AC12, AC14, AC16, AC17, AC18, NFR5, NFR9, NFR10, EC16, EC20, F7d. Lane: client. It asserts the same cases as before, plus:
    - F7d: `[aria-live="polite"][data-brief-status]` exists in the idle, no-brief and shown states (always mounted), and its text changes to `generating`, then to the error;
    - focusable controls (links, Generate, refresh, Retry) receive focus with `userEvent.tab()`, and none sets an inline `outline: none`.
  - NEW `PrBriefCard/helpers.test.ts` — `reviewFocusHref`, `isStale`, `briefErrorKind`, `latestVerdictInfo`. Lane: client.
  - NEW `OverviewTab/OverviewTab.test.tsx` — AC1 order. Lane: client.
  - NEW `client/src/app/repos/[repoId]/pulls/[number]/page.test.tsx`, or the existing page-level test if one exists — F7g. Lane: client. With reviews `[{ kind summary, verdict null }, { verdict 'request_changes', score 61 }]`, the Overview banner shows "request changes" and 61. If mocking the page is too heavy, test the selection rule as a small exported helper in the page's route-level `helpers.ts` (implementer's choice in Step 13; test-writer follows it).
  - `DiffTab.test.tsx` (extend) — stub `scrollIntoView`. AC8, EC18, NFR8, F6. Lane: client. It asserts:
    - the focus file is expanded and the focus line carries `data-focus-line`, and is scrolled;
    - a collapsed group opens;
    - a line not rendered → the header is scrolled;
    - an absent file → no scroll;
    - `line=abc`;
    - **F6:** `rerender` with the same props → `scrollIntoView` called exactly once; a new `line` → called again; while `useSmartDiff` returns `undefined` (loading) → no scroll, then data arrives → exactly one scroll;
    - with no focus, the existing assertions hold.
  - NEW `e2e/specs/09-pr-brief.flow.json` — NFR11. Lane: e2e. The same steps as before: display, reload (or re-open), then click `src/config.ts:12` → `tab=diff`, `file=src%2Fconfig.ts`, `src/config.ts`.
- Needs Docker: yes, for `brief.it.test.ts` and the seed-using `*.it.test.ts` files.

## 6. Risks and open questions
- **Resolved, F1:** the stale head SHA with a token is fixed by Step 8. The remaining side effect is that a token refresh now moves PR status to `needs_review` when the head moved, as polling already does (`server/src/modules/pulls/status.ts:51`). It is recorded for spec-creator (§0 gap 5).
- Risk: schema-mismatch detection depends on the exact provider phrase (F7b). An unknown wording falls back to `provider_error`, which is still a 502. The hermetic test pins all three phrases.
- Risk: a provider's raw output could leak. The service always throws a new `briefGenerationError(reason)` and never the provider's error (security focus, §8).
- Risk: duplicate error surfacing. Mutations always toast (`client/src/lib/providers.tsx:41-43`). Accepted, as in onboarding.
- Risk: a long synchronous POST. The ripgrep blast fallback plus the 90 s model call. The issue fetch is now bounded at 5 s and runs in parallel (F7e). NFR7 accepts the POST duration.
- Risk: the rate limit is off under `NODE_ENV=test`. The NFR3 test uses its own development-mode app.
- Risk: the in-flight join is per process. This is the local-first assumption.
- Risk: Step 9 changes the dev seed on fresh databases (a patch on `src/config.ts` plus a stored brief), so PR #482 no longer shows the AC1 empty state on a fresh dev DB. Existing DBs are unchanged.
- F7h, seed side effects on e2e flows (checked by reading `e2e/specs/04-pr-findings.flow.json` and `05-pr-diff.flow.json`):
  - 04 asserts "request changes", "2 findings", the finding title and a "Critical" button on the Agent runs tab. The seed's findings and review are unchanged.
  - The brief card adds no button named "Critical": severity icons are `role="img"` named High/Medium/Low, and the toggle names start "Show explanation for".
  - 05 waits for the text `src/config.ts` on Files changed, which still renders. The added patch only adds lines.
  - 02 asserts the PR title only.
  - Conclusion: no expected break. test-writer re-runs 02, 04 and 05 when the stack can run.
- Step 15 (P3) can be deferred without affecting any P1 AC.
- Spec gaps in §0 are routed to spec-creator; none blocks.

## 7. Not verified
- Whether agent-browser has a `reload` command (none of the flows uses one). Fallback: re-open the page.
- The `prReview.json` `verdict.*` keys (inferred from `VerdictBanner.tsx:37-40,53`).
- The warning-severity CSS variable name (`VerdictBanner/constants.ts` not read).
- That the OpenAI SDK's timeout error is named `APIConnectionTimeoutError` (from SDK knowledge, not read in `node_modules`). If it differs, timeouts still surface through `withTimeout` as `TimeoutError`.
- Whether `server/src/modules/pulls/routes.ts` is in the depcruise and `container.db` baseline (`server/.dependency-cruiser-known-violations.json` not read). Step 8 adds no new statement either way.
- `next/link` query-only navigation keeps the page mounted (expected App Router behaviour, not run).
- That `addContentTypeParser` in an encapsulated plugin overrides the default JSON parser for that scope only. Expected Fastify behaviour; the IT case in §5 proves it.
- Whether the e2e flows can run here: `scripts/e2e.sh` needs pnpm.
- Response serialization of `PrBrief` with absent `.nullish()` fields (the same pattern as `server/src/modules/blast/routes.ts:18`).

## 8. Execution mode
- Mode: multi-agent. Chosen by: user (input).
- Phases (each is one fresh `implementer` run and one commit):
  - Phase 1 — server core (contract, domain, prompt, repository) — steps 1, 2, 3, 4 — check: `.claude/scripts/check-changed.sh server client` after Step 1, then `server` per step, `--full` at the end.
  - Phase 2 — server app (service ×2, routes and wiring, PR head SHA, seed) — steps 5, 6, 7, 8, 9 — check: `.claude/scripts/check-changed.sh server`, `--full` at the end; optional `--it`.
  - Phase 3a — client brief card — steps 10, 11, 12, 13 — check: `.claude/scripts/check-changed.sh client`, `--full` at the end.
  - Phase 3b — client diff focus plus P3 — steps 14, 15 (Step 15 deferrable) — check: `.claude/scripts/check-changed.sh client --full`.
  - e2e is not an implementer phase; test-writer writes flow 09.
- Hand-off order (one writer at a time; the main session stays at the repo root):
  1. `implementer` — Phase 1.
  2. `implementer` — Phase 2.
  3. `implementer` — Phase 3a.
  4. `implementer` — Phase 3b.
  5. Bundle (`node .claude/skills/pr-self-review/scripts/bundle.mjs write`), then `plan-verifier` (scope `code`).
  6. `architecture-reviewer` and `security-reviewer` in parallel (read-only). Security focus:
     - injection through every untrusted fact (NFR4);
     - no hunk bodies;
     - grounding (AC5);
     - no raw model output in errors or logs;
     - metadata-only logs;
     - XSS and link encoding (NFR5);
     - the POST rate limit;
     - the custom JSON content-type parser scope (F7c);
     - workspace scoping in `findPull` and `listEnabledAgentDocPaths`;
     - the live issue fetch timeout;
     - the `head_sha` write in `pulls/routes.ts`.
  7. `test-writer` — §5, including the e2e flow; runs `check-changed.sh server client --full` and `server --it`.
  8. `plan-verifier` (scope `final`).
  9. `doc-writer`:
     - `server/README.md` API map;
     - `e2e/README.md` (flow 09);
     - `client/README.md`, if relevant;
     - the INSIGHTS entries in §0.
- Parallel: only step 6 (read-only reviewers). No worktree is needed.
- Gates:
  - `check-changed.sh` PASS per phase (only the 8 known cycles);
  - plan-verifier `code` before the reviews;
  - CRITICAL and HIGH findings fixed before tests;
  - plan-verifier `final` COMPLETE before docs;
  - `/pr-self-review` before the PR.
