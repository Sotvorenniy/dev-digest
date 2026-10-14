# Implementation Plan: Onboarding Tour (SPEC-02)

## 0. Spec readiness
- Source: `specs/2026-10-14-onboarding-tour.md` (SPEC-02), `Status: approved`, committed in 5160a7e.
- Spec readiness: ready ACs AC1–AC16. Blocked ACs: None. Self-check ("For reviewers of a spec") passes: every AC has an ID, an EARS form, an `_(observable: ...)_` hint and a "Verify by" lane (Traceability, spec lines 442-459). No `[NEEDS CLARIFICATION]` markers. OQ1 and OQ2 are owned by implementation-planner and are resolved below.
- OQ1 (root-file read cap), resolved: each allowlisted root file is read only when it is a regular file (not a symlink) of **≤ 64 KB** (`65_536` bytes). This is the same cap as `CONTEXT_DOC_MAX_BYTES` (`server/src/ports/project-docs.ts:11`). A larger file is skipped and recorded as `too_large`; a file that is not valid UTF-8 is skipped as `not_utf8`. Lockfiles and `.env.example` are only `stat`ed for presence and never read (NFR4). The README contributes at most 4,000 chars of its install/run section. Reason: the files we need (`package.json`, `Makefile`, compose files, README) are small, the prompt budget is 12k tokens anyway, and the 400 KB indexer cap (`server/src/modules/repo-intel/constants.ts:43`) is meant for source parsing, not prompt input.
- OQ2 (storage layout), resolved: the whole `OnboardingTour` (including `indexed_sha`, `files_indexed`, `llm_calls`, tokens, cost, `outcome`, …) is stored in the existing `onboarding.json` jsonb column. `generated_at` is also mirrored into the existing `generated_at` column (`server/src/db/schema/context.ts:120-126`). **No schema change and no migration.** The spec says the contract "is also the stored JSON" (spec line 296), and EC13 already requires a parse-on-read. If a later change does need columns, generate the migration from `server/` with `./node_modules/.bin/drizzle-kit generate` and never hand-write it.
- Spec gaps routed to spec-creator (none of them block an AC; the plan follows the spec text literally and does not fill them with an assumption):
  1. AC8 and NFR1: the spec does not say whether the 40-file facts cap (NFR1) counts as `truncated`. The plan sets `truncated` only when the 12k-token budget drops file facts (AC8 wording). Otherwise every repo with more than 40 files would show the "truncated" note (AC13). The AC8 unit test feeds the budget function facts for 5,000 files directly. Blocks: none.
  2. A `full`/`partial` index whose `file_rank` is empty (`graph_failed`, `server/src/modules/repo-intel/pipeline/full.ts:211-230`) has `files_indexed > 0`, so AC9 does not route it to a skeleton. Per the orchestrator's decision (cross-model review, finding 14), the plan **treats an empty ranked-file set as `index_degraded` (no LLM request)**, because without a grounded file set every model path would be dropped. spec-creator should confirm this condition in AC9. Blocks: none.
  3. The contract says "`first_tasks` 3–5 on `ai`" (spec line 320), but AC7 grounding can drop tasks below 3, and the model schema no longer enforces 3–5 (cross-model review, finding 1). The plan slices to 5, drops ungrounded paths, drops any task left with no path, and keeps whatever survives, possibly fewer than 3. Blocks: none.
  6. If the prompt is still over 12k estimated tokens after every reduction step (AC8), the plan skips the LLM and stores a skeleton with `skeleton_reason: "ai_failed"` and `llm_calls: 0` (cross-model review, finding 2). AC9's observable says `ai_failed` has `llm_calls = 1`. Either spec-creator adds a reason (for example `budget_exceeded`) or confirms `ai_failed` with 0 calls. Blocks: none.
  7. An unexpected infrastructure error during `generate` (cross-model review, finding 6) is stored as an `ai_failed` skeleton where possible and always writes the AC11 log line. AC9 defines `ai_failed` only for LLM failures. spec-creator should confirm the reason to use (or add one). Blocks: none.
  4. AC13 key `onboarding:notes.skeleton.<reason>` uses snake_case reason values as i18n keys. That conflicts with the "camelCase keys" convention (`AGENTS.md`, i18n). The plan follows the spec's observable keys. Blocks: none.
  5. NFR5 "a `<script>` … renders as text". The existing `Markdown` primitive (`client/src/vendor/ui/primitives/Markdown.tsx:1-42`, react-markdown 9, no `rehype-raw`) may *drop* raw HTML instead of showing it as text. Both are safe. If it drops it, the NFR5 wording needs to change, not the code. Blocks: none.
- Answered implementation questions (orchestrator decision after the cross-model review; all four defaults accepted):
  - Q1 one HTTP request — single-shot provider with transport retries off (Step 8);
  - Q2 root-file facts — `RootFilesPort` adapter injected into the onboarding service; graph facts through the repoIntel facade (Steps 2, 3);
  - Q3 e2e owner — `test-writer`, not a fourth implementer phase;
  - Q4 LLM call location — `server/src/modules/onboarding/`, reviewer-core untouched.
- Recommendations:
  - Reuse `useResyncRepoIntel` (`client/src/lib/hooks/repo-intel.ts:41-49`) for the Resync button instead of a new hook. Not asked; impact on scope: none (accepted by default as a reuse).
  - Reuse the `Markdown` primitive from `@devdigest/ui` for `architecture.summary` (no raw HTML plugin) rather than adding a sanitiser dependency. `pnpm add` is broken here (root `INSIGHTS.md`). Not asked; impact on scope: none.
  - Parse compose service names line-based (top-level `services:` block). The server has no YAML dependency (`server/package.json`) and adding one needs the standalone-pnpm workaround. Not asked; impact on scope: none.
  - After the work, record in `server/INSIGHTS.md`: (a) the global and per-route rate limit is not registered under `NODE_ENV=test` (`server/src/app.ts:110-112`); (b) the LLM SDK transport retries (`reviewer-core/src/llm/openrouter.ts:55`, `withRetry` in `server/src/adapters/llm/openai.ts:97`) make a "single request" impossible through `container.llm()`. Not asked; impact on scope: none (doc-writer / engineering-insights).

## 1. Goal and scope
- Goal: add an Onboarding Tour page per repo. A background job builds five typed sections from deterministic repo-intel facts plus allowlisted root files, using at most one structured LLM request. Paths and commands are grounded, there is an honest skeleton fallback, and each generation writes one `onboarding.generated` log line.
- In scope:
  - the new `OnboardingTour` / `OnboardingState` contract in both vendored `shared` copies;
  - read-only facade additions to repo-intel (ranked files with pagerank and hotness, file facts, index-row presence);
  - a root-files port and FS adapter;
  - a new `server/src/modules/onboarding/` module (domain, prompt, ports, repository, service, routes) and the rewritten `onboarding.system.md`;
  - a "single-shot" LLM factory in the container (transport retries off);
  - the client WORKSPACE nav item, the active-key fix, the hooks, the i18n namespace, and the `/repos/[repoId]/onboarding` page;
  - one deterministic e2e flow.
- Out of scope:
  - Share link (NG1);
  - churn, deeper clones, GitHub calls (NG2);
  - automatic generation (NG3);
  - history (NG4);
  - an in-app viewer (NG5);
  - running commands (NG6);
  - non-English prose (NG7);
  - non-JS/TS parsing (NG8);
  - Project Context nav (NG9);
  - any change to the indexer, its limits or its PageRank (NG10);
  - DB migrations (OQ2);
  - reviewer-core changes;
  - `client/src/vendor/ui` changes other than the one nav item (vendored-nav exception, spec line 510).
- AC coverage:
  - AC1 — Steps 10 — `client/src/components/app-shell/nav.test.tsx` + NEW `client/src/components/app-shell/helpers.test.ts` (client); `e2e/specs/08-onboarding-tour.flow.json` (e2e)
  - AC2 — Steps 11, 12, 13 — `OnboardingView.test.tsx` (client); `e2e/specs/08-onboarding-tour.flow.json` (e2e web)
  - AC3 — Steps 7, 9 — NEW `server/test/onboarding.it.test.ts` (it); NEW `server/test/onboarding-service.test.ts` (hermetic, join logic)
  - AC4 — Steps 11, 13 — `OnboardingView.test.tsx` (client)
  - AC5 — Steps 5, 7, 8 — `onboarding-service.test.ts` (hermetic); NEW `server/test/llm-single-shot.test.ts` (hermetic)
  - AC6 — Steps 2, 4 — NEW `server/test/onboarding-domain.test.ts` (hermetic); `onboarding-service.test.ts` (hermetic)
  - AC7 — Steps 3, 4 — `onboarding-domain.test.ts` (hermetic)
  - AC8 — Step 5 — NEW `server/test/onboarding-prompt.test.ts` (hermetic)
  - AC9 — Steps 4, 6, 7 — `onboarding-service.test.ts` (hermetic); `onboarding-domain.test.ts` (NFR10, hermetic)
  - AC10 — Steps 4, 7, 9 — `onboarding.it.test.ts` (it); `onboarding-service.test.ts` (hermetic)
  - AC11 — Step 7 — `onboarding-service.test.ts` (hermetic)
  - AC12 — Steps 1, 12, 13, 14 — `OnboardingView.test.tsx` (client); `server/test/contracts.test.ts` (hermetic)
  - AC13 — Steps 12, 13 — `OnboardingView.test.tsx` + NEW `OnboardingView/helpers.test.ts` (client)
  - AC14 — Step 14 — `OnboardingView.test.tsx` (client)
  - AC15 — Step 14 — `OnboardingView.test.tsx` (client)
  - AC16 — Steps 11, 13 — `OnboardingView.test.tsx` + `OnboardingView/helpers.test.ts` (client)
  - NFRs and ECs without their own AC row are traced in §5 (NFR2, NFR3, NFR4, NFR8, NFR9, NFR10, EC13, EC15, EC17).

## 2. Applicable constraints
- INSIGHTS entries:
  - root `INSIGHTS.md` — "A contract field added to RunStats must be optional, not just nullable". `OnboardingTour` is parsed from stored jsonb. Every field added *after* this spec must be `.nullish()`, and the fields defined now follow the spec's nullability table exactly (Step 1).
  - root `INSIGHTS.md` — "`pnpm <script>` fails via corepack". Run all server/client bins as `./node_modules/.bin/<bin>`. No new dependencies are planned.
  - `server/INSIGHTS.md` — "Prompt logs are metadata-only". The `onboarding.generated` line carries counts and ids only, never prompt text, README text, model output or commands (NFR9, Step 7).
  - `server/INSIGHTS.md` — "A service can't call `resolveFeatureModel` directly". Bind `resolveFeatureModelFor(workspaceId, 'onboarding')` in `container.ts` (`server/src/platform/container.ts:192-205`), never import `feature-models.ts` (Step 9).
  - `server/INSIGHTS.md` — "A module's ports.ts importing the repo-intel/index.js barrel adds no-circular violations". Import `../repo-intel/types.js` only (Steps 6, 7).
  - `server/INSIGHTS.md` — "dependency-cruiser's `--ignore-known` baseline is already stale…". Exactly 8 known `no-circular` errors are tolerated by `check-changed.sh` (`.claude/scripts/check-changed.sh:33-40`). Any 9th is yours.
  - `server/INSIGHTS.md` — "Plan/spec `readFile` needs a containment guard". The root-files adapter reads only fixed allowlisted names from a non-recursive `readdir` of the clone root and skips symlinks. It never joins a model- or repo-supplied path (Step 3).
  - `server/INSIGHTS.md` — "The static pricing table shipped fabricated prices" and "PriceBook.estimate returns a different price on the first call". Pass `costUsd` through as returned; `null` stays `null`, never `0` (AC11).
  - `client/INSIGHTS.md` — "A `<AppShell>`-wrapped page view needs `@/components/app-shell` mocked". Applies to `OnboardingView.test.tsx`.
  - `client/INSIGHTS.md` — "Nested `_components/` drift". Nested children share the parent's `styles.ts`/`helpers.ts` and get a named-only `index.ts`, matching the RunTraceDrawer layout.
  - `client/INSIGHTS.md` — "`MonoLink` with no `href` renders a <button>". The "Open" control is a real `<a href target="_blank" rel="noopener noreferrer">`, not a hrefless `MonoLink`.
  - `client/INSIGHTS.md` — "The `Icon`/`IconName` registry…". Use only existing `IconName`s (`FileText`, `Copy`, `Check`, `ExternalLink`, `RefreshCw`, `ChevronDown`, `ChevronRight`; `client/src/vendor/ui/icons.tsx:86-165`).
  - `client/INSIGHTS.md` — "Formatting a cost…". Not applicable: the page shows no cost.
- Architecture / AGENTS.md rules:
  - The contract changes both `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`, byte-identical in the Onboarding block (Step 1).
  - The client uses `@devdigest/shared` as type-only: `import type` only in hooks and components.
  - Onion: routes → service → ports/domain; `container.ts` is the only `new` site; services take a narrow deps object, never `Container` (`.claude/skills/onion-architecture/SKILL.md` "Rule block").
  - depcruise `adapters-not-inward-of-modules` (`server/.dependency-cruiser.cjs:65-70`): the root-files port must live in `server/src/ports/`, not in `modules/onboarding/ports.ts`.
  - depcruise `no-cross-module-internals` (`server/.dependency-cruiser.cjs:72-81`): onboarding may import `repo-intel/types.ts` only.
  - depcruise `core-zod-type-only` (`:37-43`): the runtime model-output zod schema must not be in `domain.ts`/`ports.ts`. It goes in `onboarding/prompt.ts`.
  - DB-touching tests are `*.it.test.ts`; hermetic tests must not import `test/helpers/pg.ts`.
  - Client: test hooks are `data-<thing>`; strings live in `client/messages/en/onboarding.json` (and `shell.json` for nav); component folder layout follows `client/AGENTS.md`.
  - Per-route rate limit as in `server/src/modules/intent/routes.ts:26` (`config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`).
- Do-not-touch items near this change:
  - `server/src/db/migrations/**`;
  - `server/src/db/schema/context.ts` (no schema change);
  - `client/src/app/onboarding/**` (Add-repository screen, NFR8);
  - `e2e/specs/06-onboarding.flow.json`;
  - `reviewer-core/**`;
  - `client/src/vendor/ui/**` except `nav.ts` (one WORKSPACE item only);
  - `client/src/vendor/ui/icons.tsx`;
  - `server/src/modules/repo-intel/pipeline/**` and the indexing methods (NG10);
  - `server/clones/**`; lockfiles; `specs/**`.

## 3. Skill assignments
| Step | Skills the executing agent must read | Rules from the skill that shape this step |
|---|---|---|
| 1 | `zod` | "type-export-schemas-and-types" (PascalCase const + `z.infer` type of the same name); "object-optional-vs-nullable" with the AGENTS.md mapping `.nullable()` = always present, `.nullish()` = optional-or-null; "schema-use-enums" for `status`/`outcome`/`skeleton_reason` (`zod/SKILL.md`) |
| 2 | `onion-architecture`, `drizzle-orm-patterns` | The facade is the module contract other modules use (`references/layers.md` "Cross-module access"); Drizzle stays in `repository.ts` (`SKILL.md` "The files of a module"); do not extend baselined violations (`SKILL.md` Decision 4) |
| 3 | `onion-architecture`, `security` | Integrations live in adapters behind ports (`SKILL.md` "Rule block"); shared ports in `src/ports/` (`SKILL.md` Decision 1); path traversal: never `path.join` untrusted input, resolve + containment (`security/SKILL.md` "File Upload Security", "Framework Security Quirks"); never read secret values (`security/SKILL.md` A09) |
| 4 | `onion-architecture`, `security` | `domain.ts` is pure: no SDK, no DB, no runtime zod (`SKILL.md` "The files of a module"); domain errors subclass `AppError`; ground AI output before storing (`security/SKILL.md` "Agentic AI Security", ASI09) |
| 5 | `onion-architecture`, `zod`, `security` | Untrusted repo text only via `wrapUntrusted()` (spec NFR3; `security/SKILL.md` ASI01 "Goal Hijacking"); model output validated by schema (`zod/SKILL.md` "parse-never-trust-json"); runtime zod outside core (`.dependency-cruiser.cjs:37-43`) |
| 6 | `onion-architecture`, `drizzle-orm-patterns`, `zod` | Port speaks domain, never `$inferSelect` (`references/layers.md` "Ports"); mapping rows ↔ domain in the repository (`references/layers.md` "Mapping"); `safeParse` persisted JSON (`zod/SKILL.md` "parse-use-safeparse") |
| 7 | `onion-architecture`, `security` | Service takes a narrow deps object, never `Container` (`SKILL.md` Workflow step 3); no HTTP knowledge in the service beyond the `AppError` taxonomy (`SKILL.md` Checklist HIGH); logs are metadata only, never secrets (`security/SKILL.md` A09) |
| 8 | `onion-architecture` | `container.ts` is the only place concrete providers are built (`SKILL.md` "Rule block"); adapters are reused, `vendor/**` port types never edited (`SKILL.md` Decision 1) |
| 9 | `onion-architecture`, `fastify-best-practices`, `zod`, `security` | A route parses, calls the service, maps to the DTO, and never touches DB/adapters (`SKILL.md` "Rule block", CRITICAL); one module = one import + one entry in `modules/index.ts` (`server/AGENTS.md`); schema-first params (`fastify-best-practices/SKILL.md` "Core Principles"); rate-limit AI generation (`security/SKILL.md` A06) |
| 10 | `frontend-ui-architecture` | Vendored files are normally untouched (`references/this-repo.md` "Vendored packages"); the user-approved exception is limited to one nav item; pure helper in `helpers.ts`, tested beside it (`SKILL.md` "Where tests live") |
| 11 | `frontend-ui-architecture`, `react-best-practices` | Data path `lib/api.ts` → `lib/hooks/*` → component; never `fetch` in components (`references/this-repo.md` "One data path"); poll with a conditional `refetchInterval` (`references/this-repo.md` "Hooks live in two places"); server data is not component state (`SKILL.md` "Where business logic lives") |
| 12 | `frontend-ui-architecture` | One namespace file `client/messages/en/<ns>.json`, no inline JSX strings (`references/this-repo.md` "i18n") |
| 13 | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` | Thin `"use client"` page + `_components/` view inside `<AppShell crumb>` (`references/this-repo.md` "Route-level files"); nested `_components/` children share the parent's styles and use a named-only `index.ts` (`references/this-repo.md` table); domain rules in `helpers.ts`, not JSX (`SKILL.md` "Anti-patterns"); derive, don't store (`react-best-practices/SKILL.md`); `useParams` for the route param (`next-best-practices/SKILL.md` "Functions") |
| 14 | `frontend-ui-architecture`, `react-best-practices`, `security` | Bare `atoms.tsx` only for logic-free pieces; anything with state (copy button, collapse) gets a folder (`references/this-repo.md` "bare-file escape hatch"); never `dangerouslySetInnerHTML`; validate `href` (`security/SKILL.md` A05 XSS, React quirks) |
| Tests (test-writer) | `onion-architecture` (`references/testing.md`), `react-testing-library`, `spec-writing` (`references/ears.md` "Verify by") | Fakes of ports, not `vi.mock` of module paths (`references/testing.md` "Rules"); `*.it.test.ts` for pg; RTL: behaviour not implementation, query by role/name, mock at boundaries (`react-testing-library/SKILL.md` "Philosophy") |

## 4. Steps

### Step 1 — Onboarding contract in both vendored shared copies  (package: server + client vendored shared)
- Covers: AC12 (section shape/order on the wire), NFR8 (copies identical; stored-tour parse); prerequisite of Steps 4–9, 11–14
- Files:
  - `server/src/vendor/shared/contracts/knowledge.ts` — replace the `// ---- Onboarding ----` block;
  - `client/src/vendor/shared/contracts/knowledge.ts` — the identical block;
  - `server/test/contracts.test.ts` — keep the suite compiling: replace the `Onboarding` import/assertion with a minimal `OnboardingTour.parse` (test-writer extends it later).
- Context:
  - the block to replace is `server/src/vendor/shared/contracts/knowledge.ts:28-47` and the client copy `client/src/vendor/shared/contracts/knowledge.ts:28-47`;
  - `export const OnboardingSection = z.object({ kind: z.string(), ... })` is the old generic shape;
  - the existing usage to fix is `server/test/contracts.test.ts:12` (import `Onboarding`) and `:143-147`;
  - no file in `client/src`, `server/src`, `reviewer-core/src`, `mcp/src`, `e2e/*.ts`, `e2e/lib`, `docs/`, `server/docs/` or `client/docs/` references `Onboarding`, `OnboardingSection` or `OnboardingLink` outside the two vendored `knowledge.ts` copies and the vendored `index.ts` header comments (grep verified, cross-model review finding 22). The only consumer is `server/test/contracts.test.ts`. Re-run that grep before removing them;
  - pattern for enum + object contracts: `knowledge.ts:9-26` (Conformance).
- Change: export these schemas and same-named `z.infer` types:
  - `OnboardingIndexStatus` = `z.enum(['full','partial','degraded','failed'])`;
  - `OnboardingOutcome` = `z.enum(['ai','skeleton'])`;
  - `OnboardingSkeletonReason` = `z.enum(['index_degraded','index_failed','no_api_key','ai_failed'])`;
  - `OnboardingArchitectureNode` `{id, label, path: string.nullable()}`;
  - `OnboardingArchitectureEdge` `{from, to}`;
  - `OnboardingCriticalPath` `{path, why: nullable}`;
  - `OnboardingRunCommand` `{command, note: nullable, source}`;
  - `OnboardingReadingPathEntry` `{path, reason: nullable, score: number}`;
  - `OnboardingFirstTask` `{title, why, paths: z.array(z.string()).min(1)}`;
  - `OnboardingSections` `{architecture: {summary: nullable string, nodes: array.max(12), edges}, critical_paths: array.max(8), run_locally, reading_path: array.max(10), first_tasks: array.max(5)}`;
  - `OnboardingTour` with every top-level field of the spec table (spec lines 299-320), nullability exactly as listed (`skeleton_reason`, `model`, `tokens_in`, `tokens_out`, `cost_usd` `.nullable()`; `llm_calls` `z.number().int().min(0).max(1)`);
  - `OnboardingState` `{status: enum none|generating|ready, job_id: nullable, index: {status, usable: boolean, files_indexed: int, last_indexed_sha: nullable}, is_stale: boolean, tour: OnboardingTour.nullable()}`;
  - `OnboardingGenerateResponse` `{status: z.literal('generating'), job_id: string}`.

  Remove `Onboarding`, `OnboardingSection`, `OnboardingLink`. Add a header comment on the block: "stored JSON — fields added after SPEC-02 must be `.nullish()`".
- Skills: `zod` — PascalCase const + same-named type; `.nullable()` vs `.nullish()` per AGENTS.md; enums for fixed values.
- Done when: the two Onboarding blocks are byte-identical (`diff` of the two regions is empty); `tsc --noEmit` passes in server and client; `.claude/scripts/check-changed.sh server client` passes.
- Depends on: none
- Agent: implementer — Phase: 1

### Step 2 — repo-intel facade: ranked files, file facts, index-row presence  (package: server)
- Covers: prerequisite of Step 4 (AC6 score inputs, AC7 indexed file set), Step 7 (AC9 gating, AC10 usable)
- Files:
  - `server/src/modules/repo-intel/types.ts` — add row types and three facade methods;
  - `server/src/modules/repo-intel/service.ts` — implement them;
  - `server/src/modules/repo-intel/repository.ts` — add one query;
  - `server/test/helpers/repo-intel-stub.ts` — implement the new methods (empty/false) so existing suites type-check.
- Context:
  - the facade interface is `server/src/modules/repo-intel/types.ts:137-172`;
  - the existing `getTopFilesByRank(repoId, n, opts?)` at `service.ts:642-659` filters with `isJunkPath` (`service.ts:716-736`, module-private);
  - the flag gate idiom is `if (!this.container.config.repoIntelEnabled) return [];` (`service.ts:647`);
  - `tryGetIndexState(repoId): Promise<IndexState | null>` is at `repository.ts:205`;
  - `getRankedPaths(repoId, limit)` (`repository.ts:449-459`) is the pattern for the new query;
  - `getFileFacts(repoId, files): Promise<IndexerFileFactsRow[]>` is at `repository.ts:534`;
  - the `file_rank` columns `pagerank`, `hotness`, `rank` are in `server/src/db/schema/repo-intel.ts:105-121`;
  - the stub is `server/test/helpers/repo-intel-stub.ts:10-58` and is spread in `server/test/blast.it.test.ts:42-44`.
- Change:
  - `types.ts`:
    - `export interface RankedFileRow { path: string; pagerank: number; hotness: number; junk: boolean }`;
    - `export interface FileFactsRow { path: string; endpoints: string[]; crons: string[] }`;
    - on `RepoIntel`: `hasIndexState(repoId: string): Promise<boolean>`, `getRankedFiles(repoId: string): Promise<RankedFileRow[]>` (all `file_rank` rows; `junk` = the existing `isJunkPath`), `getFileFacts(repoId: string, paths: string[]): Promise<FileFactsRow[]>`.
  - `repository.ts`: `getRankedFileRows(repoId)` selects path/pagerank/hotness ordered by `rank desc, file_path asc`.
  - `service.ts`:
    - `hasIndexState`: returns `false` when `config.repoIntelEnabled` is off (repo-intel disabled means the repo is not usable), otherwise `(await this.repo.tryGetIndexState(id)) !== null`;
    - `getRankedFiles` and `getFileFacts` are flag-gated like their neighbours;
    - map the repository rows to the facade shape: `IndexerFileFactsRow.filePath` → `FileFactsRow.path` (`repository.ts:99-103`), and the ranked row's `filePath` → `path`. Repository names never leak through the facade.

  Read-only additions: indexing, limits and PageRank are untouched (NG10).
- Skills: `onion-architecture`, `drizzle-orm-patterns` — Drizzle only in `repository.ts`; consumers import `types.ts`; zero new depcruise violations.
- Done when: `tsc --noEmit` passes (the stub compiles); the existing repo-intel tests are green; `.claude/scripts/check-changed.sh server` passes with only the 8 known cycles.
- Depends on: none
- Agent: implementer — Phase: 1

### Step 3 — Root-files port and FS adapter (OQ1)  (package: server)
- Covers: NFR4 (`.env.example` never read), untrusted input "repo file content" (containment); prerequisite of Step 4 (AC7 candidate commands)
- Files:
  - `NEW server/src/ports/root-files.ts` — port, snapshot type, constants;
  - `NEW server/src/adapters/root-files/fs-root-files.ts` — `FsRootFiles implements RootFilesPort`;
  - `server/src/adapters/index.ts` — export it;
  - `server/src/platform/container.ts` — `ContainerOverrides.rootFiles?: RootFilesPort` and a lazy `get rootFiles()` (same shape as `projectDocs`).
- Context:
  - the pattern to copy is `server/src/adapters/project-docs/fs-project-docs.ts:38-123` (`readdir` with `withFileTypes`, skip `isSymbolicLink()`, `stat` size check, fatal `TextDecoder`) and its port `server/src/ports/project-docs.ts:11,22`;
  - the barrel is `server/src/adapters/index.ts:11`;
  - container overrides are at `container.ts:64-82`, the getter pattern at `container.ts:234-242`;
  - the clone path comes from `this.git.clonePathFor(r)` (`container.ts:237`);
  - depcruise `adapters-not-inward-of-modules` (`.dependency-cruiser.cjs:65-70`) is why the port is in `src/ports/`.
- Change:
  - `ROOT_FILE_MAX_BYTES = 65_536`.
  - Allowlist (exact names or regex, root only):
    - read: `package.json`, `Makefile`, `/^(docker-)?compose(\.[\w-]+)?\.ya?ml$/i`, `/^readme(\.md|\.markdown|\.txt)?$/i`;
    - presence only (`stat`): `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`, `bun.lock`, `.env.example`.
  - `interface RootFilesSnapshot { packageJson: string | null; makefile: string | null; composeFiles: { name: string; text: string }[]; readme: { name: string; text: string } | null; lockfiles: string[]; hasEnvExample: boolean; skipped: { name: string; reason: 'too_large' | 'not_utf8' }[] }`.
  - `interface RootFilesPort { read(repo: RepoRef): Promise<RootFilesSnapshot | null> }` returns null when the clone root is unavailable.
  - One non-recursive `readdir(root)`. `.env.example` is never opened.
  - Sort names to keep the snapshot deterministic (NFR10).
  - README pick rule when several match: prefer `README.md`, case-insensitive; otherwise the first match in sorted name order.
- Skills: `onion-architecture`, `security` — adapter behind a port; no `path.join` of untrusted input; symlinks skipped; secret values never read.
- Done when: `tsc --noEmit` passes; depcruise shows no new violation; `container.rootFiles` resolves (override first).
- Depends on: none
- Agent: implementer — Phase: 1

### Step 4 — Onboarding domain: scoring, candidates, gating, grounding, skeleton  (package: server)
- Covers: AC6, AC7, AC9 (gating + skeleton content), AC10 (`RepoNotIndexedError`), NFR4 (presence-only env), NFR10
- Files:
  - `NEW server/src/modules/onboarding/constants.ts` — limits;
  - `NEW server/src/modules/onboarding/domain.ts` — pure functions and the domain error.
- Context:
  - `AppError(code, message, statusCode)` is at `server/src/platform/errors.ts:7-17`; pattern subclass `NotFoundError` at `:19-23`;
  - critical paths come as `getCriticalPaths(repoId): Promise<string[][]>` (`server/src/modules/repo-intel/types.ts:171`), chains of ≤ 3 files from 5 roots (`service.ts:666-709`);
  - pure-domain example: `server/src/modules/intent/domain.ts` (`finaliseIntent`, `extractHunkHeaders`);
  - contract types from Step 1 (`import type` only).
- Change:
  - `constants.ts`:
    - `READING_PATH_MAX = 10`, `READING_PATH_MIN = 6`, `CRITICAL_PATHS_MAX = 8`, `ARCH_NODES_MAX = 12`, `FIRST_TASKS_MIN = 3`, `FIRST_TASKS_MAX = 5`, `FACT_FILES_MAX = 40`;
    - `PROMPT_TOKEN_BUDGET = 12_000`, `MAX_OUTPUT_TOKENS = 4_000`, `LLM_TIMEOUT_MS = 90_000`;
    - `ONBOARDING_JOB_KIND = 'onboarding-generate'`, `ONBOARDING_JOB_TIMEOUT_MS = 120_000`, `ONBOARDING_JOB_RETRIES = 0`;
    - `README_EXCERPT_MAX_CHARS = 4_000`, `README_COMMANDS_MAX = 20`, `CANDIDATE_COMMANDS_MAX = 60`, `STACK_DEPS_MAX = 40`, `ENDPOINTS_PER_FILE_MAX = 10`;
    - `GENERATE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }`.
  - `domain.ts` exports:
    - `class RepoNotIndexedError extends AppError` with code `repo_not_indexed` and status 409.
    - `isUsable(clonePath: string | null, hasIndexState: boolean): boolean`.
    - `skeletonReasonForIndex(status: IndexStatus, filesIndexed: number, rankedCount: number): 'index_degraded' | 'index_failed' | null`:
      - `failed` → `index_failed`;
      - `degraded`, `filesIndexed === 0`, or `rankedCount === 0` → `index_degraded` (the empty ranked-set guard is spec gap 2 in §0);
      - else `null`.
    - `scoreOf(pagerank, hotness) = pagerank * (1 + hotness)`.
    - `selectReadingPath(rows: RankedFileRow[]): { path: string; score: number }[]` — drop `junk`, sort by score desc then path asc, take `READING_PATH_MAX` (all if fewer).
    - `selectFactFiles(rows)`: the same order, top `FACT_FILES_MAX`.
    - `churnAvailable(rows) = rows.some(r => r.hotness > 0)`.
    - `inferPackageManager(lockfiles)`: pnpm > yarn > bun > npm.
    - `deriveCandidateCommands(snapshot): { command: string; source: string }[]`, deterministic order:
      - `<pm> install` and `<pm> run <script>` for each `package.json` script in key order (source `package.json`);
      - `cp .env.example .env` when `hasEnvExample` (source `.env.example`);
      - `docker compose up -d <service>` for each service parsed line-based from the top-level `services:` block (source = compose file name);
      - `make <target>` for each `^[A-Za-z0-9_.-]+:` target, excluding `.PHONY` and `%` rules (source `Makefile`);
      - shell lines from fenced code blocks under the first README heading matching `/install|getting started|quick ?start|run|setup|development|usage/i`, leading `$ ` stripped, comments dropped, capped at `README_COMMANDS_MAX` (source = README name);
      - deduplicated by exact command;
      - capped at `CANDIDATE_COMMANDS_MAX = 60` in total, in this order.
    - `readmeRunExcerpt(snapshot)`: the same section text, capped at `README_EXCERPT_MAX_CHARS`.
    - `deriveStack(snapshot, rows)`: dependency names only (capped at `STACK_DEPS_MAX = 40`, sorted), plus file-extension counts (top 10).
    - `deriveStructure(rows)`: top-level directories by file count, at most `ARCH_NODES_MAX`.
    - `flattenCriticalPaths(chains)`: unique files in chain order, at most `CRITICAL_PATHS_MAX`.
    - `buildSkeletonSections(input)`:
      - `architecture` = `{summary: null, nodes: structure dirs (path null), edges: []}`;
      - `critical_paths` from `flattenCriticalPaths` with `why: null`;
      - `run_locally` = all candidates with `note: null`;
      - `reading_path` = `selectReadingPath` with `reason: null`;
      - `first_tasks: []`.
    - `groundModelSections(output, ctx: { indexed: Set<string>; candidates; readingPath; skeleton }): { sections; droppedPaths: number }`:
      - reading_path keeps the deterministic order and set; only `reason` comes from the model entry with the same path; model entries whose path is not in `indexed` are counted as dropped;
      - critical_paths keeps model entries whose path is in `indexed` (≤ 8); the deterministic list is used when none survive;
      - run_locally keeps model commands that equal a candidate character for character (taking `source` from the candidate), then appends the candidates the model did not list, in deterministic order; each invented command counts as one drop;
      - nodes with a non-null path not in `indexed` are dropped and counted, and so are their edges; edges to unknown ids are dropped silently;
      - first_tasks paths not in `indexed` are removed and counted; a task left with no path is removed;
      - counts are enforced here, not by the model schema (cross-model review finding 1): slice nodes to `ARCH_NODES_MAX`, critical paths to `CRITICAL_PATHS_MAX`, reading-path reasons only for the deterministic set, and first tasks to `FIRST_TASKS_MAX`. Fewer than `FIRST_TASKS_MIN` survivors are kept as-is (spec gap 3).
- Skills: `onion-architecture`, `security` — pure core (no zod runtime, no FS); ground model output before storing.
- Done when: `tsc --noEmit` passes; depcruise shows no new violation (`domain.ts` imports only `type`s, `../../platform/errors.js`, `./constants.js`, `../repo-intel/types.js`).
- Depends on: 1, 2, 3
- Agent: implementer — Phase: 1

### Step 5 — Prompt assembly, token budget, model-output schema, system prompt  (package: server)
- Covers: AC8, NFR3; prerequisite of Step 7 (AC5)
- Files:
  - `NEW server/src/modules/onboarding/prompt.ts`;
  - `server/src/prompts/onboarding.system.md` — rewrite.
- Context:
  - `wrapUntrusted(label: string, content: string): string` is at `reviewer-core/src/prompt.ts:45` and exported from `reviewer-core/src/index.ts:18`;
  - a server module importing reviewer-core is precedent: `server/src/modules/intent/service.ts:9`;
  - `loadPromptTemplate(name)` is at `server/src/platform/prompts.ts:24`;
  - token estimate convention is `Math.ceil(text.length / 4)` (`server/src/ports/project-docs.ts:22`);
  - the existing prompt to replace is `server/src/prompts/onboarding.system.md:1-44` (different sections, bare `<untrusted>`);
  - runtime zod is forbidden in core (`server/.dependency-cruiser.cjs:37-43`), so the schema lives here.
- Change:
  - `export const OnboardingModelOutput = z.object({...})`:
    - `architecture: {summary: string, nodes: [{id, label, path: string|null}], edges: [{from,to}]}`;
    - `critical_paths: [{path, why: string|null}]`;
    - `run_locally: [{command, note: string|null}]`;
    - `reading_path: [{path, reason: string|null}]`;
    - `first_tasks: z.array({title, why, paths: z.array(z.string())})`.
    - **No `.min()`/`.max()` on any array** (cross-model review finding 1). `toJsonSchema` uses OpenAI's `zodResponseFormat` (`reviewer-core/src/llm/structured.ts:19-22`), which would emit `minItems`/`maxItems`. Strict json_schema upstreams may reject those, and with repairs off that would make every call `ai_failed`. All counts are enforced in `groundModelSections` (Step 4).
  - `export interface OnboardingFacts { readingPath; factFiles: { path; score; endpoints: string[] }[]; criticalPaths: string[][]; candidates; stack; structure; readmeExcerpt: string | null }`.
  - `export function assemblePrompt(facts, systemPrompt, budget = PROMPT_TOKEN_BUDGET): { messages: ChatMessage[]; estTokens: number; truncated: boolean; overBudget: boolean; sections: { name: string; chars: number }[] }`:
    - every repo-derived text goes through `wrapUntrusted` with a distinct label (`repo:file-ranking`, `repo:critical-paths`, `repo:candidate-commands`, `repo:stack`, `repo:structure`, `repo:endpoints`, `repo:readme-excerpt`);
    - fixed instructions stay outside the blocks;
    - every non-file block is bounded before budgeting (cross-model review finding 2):
      - candidates ≤ `CANDIDATE_COMMANDS_MAX`;
      - stack deps ≤ `STACK_DEPS_MAX`;
      - structure ≤ `ARCH_NODES_MAX`;
      - critical paths ≤ 5 chains;
      - endpoints ≤ `ENDPOINTS_PER_FILE_MAX` per file;
      - README excerpt ≤ `README_EXCERPT_MAX_CHARS`.
    - The budget fit is linear, not a drop-and-re-render loop (cross-model review finding 3):
      1. render the fixed part once;
      2. estimate each fact file's rendered line cost once;
      3. keep the longest prefix of files, in score order, that fits the remaining budget;
      4. `truncated = kept < factFiles.length`;
      5. render once.
    - If the fixed part alone exceeds the budget, drop `readmeExcerpt` and re-measure once. If it still exceeds the budget, return `overBudget: true`; the service then skips the LLM (spec gap 6).
  - `onboarding.system.md`:
    - English only;
    - exactly the five sections;
    - commands must be copied verbatim from `repo:candidate-commands`;
    - paths only from the facts;
    - Markdown, no HTML;
    - diagram as nodes/edges, not Mermaid;
    - the reference to `<untrusted source="...">` blocks as data.
- Skills: `onion-architecture`, `zod`, `security` — wrapUntrusted for all repo text; schema-validated output; runtime zod outside core.
- Done when: `tsc --noEmit` passes; depcruise is clean; `assemblePrompt` on an empty facts object returns `truncated: false, overBudget: false`.
- Depends on: 4
- Agent: implementer — Phase: 2

### Step 6 — Onboarding ports and repository (OQ2: jsonb, no migration)  (package: server)
- Covers: AC9 (store overwrite, EC15), NFR8 (corrupt row → no tour, EC13), EC17 (cascade, unchanged); prerequisite of Step 7
- Files:
  - `NEW server/src/modules/onboarding/ports.ts`;
  - `NEW server/src/modules/onboarding/repository.ts`.
- Context:
  - the table is `onboarding` (`server/src/db/schema/context.ts:120-126`: `repoId` PK cascade, `json` jsonb notNull, `generatedAt`), exported via `server/src/db/schema.ts:76`;
  - workspace-scoped repo lookup pattern: `ProjectContextRepository.findRepo` (`server/src/modules/project-context/repository.ts:14-20`), with the port at `project-context/ports.ts:11-14`;
  - port slicing pattern: `IntentGitPort = Pick<GitClient, 'readFile'>` (`server/src/modules/intent/ports.ts:55`);
  - the repo-intel import must be `../repo-intel/types.js` only (server INSIGHTS).
- Change:
  - `ports.ts`:
    - `OnboardingRepoRef { id; owner; name; fullName; clonePath: string | null }`;
    - `OnboardingRepositoryPort { findRepo(workspaceId, repoId): Promise<OnboardingRepoRef | null>; getTour(repoId): Promise<OnboardingTour | null>; saveTour(repoId, tour: OnboardingTour): Promise<void> }`;
    - `OnboardingRepoIntelPort = Pick<RepoIntel, 'getIndexState' | 'hasIndexState' | 'getRankedFiles' | 'getFileFacts' | 'getCriticalPaths'>`;
    - `OnboardingRootFilesPort = RootFilesPort` (re-export type);
    - `OnboardingJobPayload { workspaceId; repoId }`;
    - `OnboardingJobsPort { enqueue(workspaceId: string, payload: OnboardingJobPayload): Promise<{ id: string; done: Promise<void> }> }`;
    - `OnboardingLogPort { info(obj: unknown, msg?: string): void; warn(obj: unknown, msg?: string): void }`.
  - `repository.ts`:
    - `findRepo` is workspace-scoped (`repos.workspaceId` + `repos.id`);
    - `getTour` selects `json` and returns `OnboardingTour.safeParse(json).success ? data : null`;
    - `saveTour` inserts or `onConflictDoUpdate` on `repoId`, setting `json` and `generatedAt = new Date(tour.generated_at)`.
  - No schema change; do not run drizzle-kit.
- Skills: `onion-architecture`, `drizzle-orm-patterns`, `zod` — the port speaks domain; the repository maps rows; `safeParse` for persisted JSON.
- Done when: `tsc --noEmit` passes; depcruise is clean.
- Depends on: 1, 2, 3
- Agent: implementer — Phase: 2

### Step 7 — OnboardingService: state, request (join/409), generate (one call, skeleton, log)  (package: server)
- Covers: AC3 (join in-flight), AC5, AC9, AC10, AC11, NFR1, NFR4, NFR9, NFR10, EC14 (in-memory in-flight state)
- Files: `NEW server/src/modules/onboarding/service.ts`
- Context:
  - service deps pattern is `IntentServiceDeps` (`server/src/modules/intent/service.ts:43-52`);
  - the pino metadata log pattern is at `intent/service.ts:189-207`;
  - `withTimeout(p, ms)` and `TimeoutError` are at `server/src/platform/resilience.ts:6,13`;
  - `ConfigError` (code `config_error`) is at `server/src/platform/errors.ts:37-40` and is thrown by `container.llm` when a key is missing (`container.ts:341,349,356`);
  - `StructuredRequest` fields `maxTokens`, `timeoutMs`, `maxRetries`, `sessionId` are at `server/src/vendor/shared/adapters.ts:55-70`;
  - `StructuredResult.costUsd: number | null` is at `:72-80`;
  - `IndexState.lastIndexedSha` is `''` when synthesised (`repo-intel/service.ts:189-205`).
- Change:
  - `export interface OnboardingServiceDeps { repo; repoIntel; rootFiles; jobs; llm: (p: Provider) => Promise<LLMProvider>; resolveModel: (workspaceId) => Promise<FeatureModelChoice>; systemPrompt: () => Promise<string>; now?: () => Date; limits?: Partial<{ llmTimeoutMs: number }> }`.
  - `class OnboardingService` keeps `private inFlight = new Map<string, Promise<string>>()` keyed by repoId.
  - `getState(workspaceId, repoId): Promise<OnboardingState>`:
    - 404 via `NotFoundError` when `findRepo` returns null;
    - `usable = isUsable(clonePath, await hasIndexState)`;
    - `index` comes from `getIndexState` (`last_indexed_sha: '' → null`);
    - `tour = await repo.getTour`;
    - `status` = `generating` (with `job_id`) if in-flight, else `ready` if tour, else `none`;
    - `is_stale = !!tour && tour.indexed_sha !== (index.last_indexed_sha ?? '')`.
  - `requestGeneration(workspaceId, repoId): Promise<{ status: 'generating'; job_id: string }>`:
    - 404 if repo not found;
    - throw `RepoNotIndexedError` if not usable, without enqueuing;
    - if `inFlight.has(repoId)` return the same promise's id;
    - otherwise set the map entry **synchronously** to the enqueue promise *before* any await (the race fix for two POSTs 100 ms apart), and on `done` settle (`finally`) delete the entry;
    - if `enqueue()` itself rejects, delete the entry before rethrowing, so the next request can start a new job (cross-model review finding 5). Only the request that created the entry deletes it: compare by identity.
  - `generate(payload, ctx: { logger: OnboardingLogPort }): Promise<void>`:
    1. `started = Date.now()`;
    2. load the state, ranked files, critical paths, root snapshot and the fact files' `getFileFacts`;
    3. `reason = skeletonReasonForIndex(state.status, state.filesIndexed, ranked.length)`. If null, resolve the model, then `llm(provider)`; a `ConfigError` gives `no_api_key`;
    4. otherwise `assemblePrompt`. If it returns `overBudget`, store an `ai_failed` skeleton with `llm_calls: 0` and make no request (spec gap 6). Otherwise make exactly one `llm.completeStructured({ model, schema: OnboardingModelOutput, schemaName: 'OnboardingTour', messages, maxTokens: MAX_OUTPUT_TOKENS, timeoutMs: LLM_TIMEOUT_MS, maxRetries: 0, temperature: 0 })` wrapped in `withTimeout(…, LLM_TIMEOUT_MS)`. Any throw or timeout gives `ai_failed` (llm_calls 1, tokens and cost null). Success goes through `groundModelSections` with `outcome: 'ai'`;
    5. build the `OnboardingTour` (skeleton sections for every skeleton reason; `model` null when no request was made; `churn_available`; `truncated`; `dropped_paths`) and `saveTour` (overwrite);
    6. exactly one `ctx.logger.info({ event: 'onboarding.generated', repo_id, indexed_sha, model, llm_calls, tokens_in, tokens_out, cost_usd, duration_ms, outcome, skeleton_reason, dropped_paths, truncated }, 'onboarding.generated')`. No other fields: no prompt text, no commands, no README.
  - `indexed_sha` = `state.lastIndexedSha` exactly, which may be `''` when the persisted row has no sha (`repo-intel/pipeline/full.ts:88`). It is never replaced by a branch name. The client hides the Open link when it is empty (Step 14), and `is_stale` compares `''` with `''` as not stale (cross-model review finding 7).
  - Infrastructure errors (cross-model review finding 6):
    - `generate` wraps steps 2–5 in a try/catch for any non-`AppError` error (and for an `AppError` other than the handled `ConfigError`);
    - on such an error it builds an `ai_failed` skeleton from whatever facts were collected (empty lists otherwise; spec gap 7) and tries `saveTour` once; a failed save is logged as `warn` with only `{ event: 'onboarding.save_failed', repo_id }`;
    - in every path, the single `onboarding.generated` line is written in a `finally`;
    - the job itself resolves, so the JobRunner does not retry.
- Skills: `onion-architecture`, `security` — narrow deps, no `Container`; `AppError` taxonomy only; metadata-only log.
- Done when: `tsc --noEmit` passes; depcruise is clean (`service.ts` imports only ports, domain, prompt, constants, `../repo-intel/types.js`, `../../platform/{errors,resilience}.js`, `@devdigest/shared` types and `@devdigest/reviewer-core`).
- Depends on: 4, 5, 6
- Agent: implementer — Phase: 2

### Step 8 — Single-shot LLM factory (one HTTP request, transport retries off)  (package: server)
- Covers: AC5 ("no repair re-prompt, no job retry", Q5 "exactly one HTTP request"), NFR1 (90 s)
- Files:
  - `server/src/adapters/llm/openai.ts` — optional constructor option;
  - `server/src/adapters/llm/anthropic.ts` — optional constructor option;
  - `server/src/platform/container.ts` — `async llmSingleShot(id)`.
- Context:
  - `OpenRouterProviderOptions { timeoutMs?, maxRetries?, estimateCost? }` is at `reviewer-core/src/llm/openrouter.ts:27-37`; its SDK client defaults to `maxRetries ?? 2` (`:55`) and retries on timeout/5xx/429, and its repair loop uses `req.maxRetries ?? 2` (`:61`);
  - `OpenAIProvider` constructor is `new OpenAI({ apiKey })` (`openai.ts:51-53`) and each attempt is wrapped in `withRetry` (`openai.ts:97`);
  - `AnthropicProvider` is the same (`anthropic.ts:45-47`, loop `:92-117`);
  - `withRetry(fn, { retries })` defaults to 3 (`server/src/platform/resilience.ts:46-47`);
  - `container.llm`/`buildLlm` are at `container.ts:328-358` and `ContainerOverrides.llm` at `:72`.
- Change:
  - `OpenAIProvider` and `AnthropicProvider` constructors gain `opts: { transportRetries?: number } = {}`. With `transportRetries === 0`: SDK `maxRetries: 0` and `withRetry(..., { retries: 0 })`. Defaults are unchanged for every other caller.
  - Fold single-shot into the existing builder (cross-model review finding 9): change `private async buildLlm(id)` (`container.ts:338`) to `buildLlm(id, opts: { singleShot?: boolean } = {})`. Key lookup, `ConfigError` and the PriceBook `estimateCost` closure are shared:
    - openrouter: `new OpenRouterProvider(key, { estimateCost, ...(singleShot ? { maxRetries: 0, timeoutMs: LLM_TIMEOUT_MS } : {}) })`;
    - openai/anthropic: `{ transportRetries: singleShot ? 0 : undefined }`.
  - `async llmSingleShot(id)`: return `this.overrides.llm?.[id]` if injected (so tests' mocks are used); otherwise `buildLlm(id, { singleShot: true })`, **uncached** (`llmCache` keeps only the default providers).
- Skills: `onion-architecture` — concrete construction only in `container.ts`; vendored port types unchanged.
- Done when: `tsc --noEmit` passes; existing `server/test/adapters.test.ts` is green; default `container.llm()` behaviour is unchanged (same args to the constructors when `singleShot` is false).
- Depends on: none (consumed by Step 9)
- Agent: implementer — Phase: 2

### Step 9 — Routes, job registration, container wiring, module registry  (package: server)
- Covers: AC3 (202 + job_id), AC10 (409), AC11 (logger passed to the job), NFR2 (10/min)
- Files:
  - `NEW server/src/modules/onboarding/routes.ts`;
  - `server/src/modules/index.ts` — one import and one entry;
  - `server/src/platform/container.ts` — `get onboardingService()`.
- Context:
  - job register + enqueue pattern: `server/src/modules/conventions/routes.ts:57-69` (`container.jobs.register(KIND, handler, { timeoutMs, retries })`);
  - `JobRunner.register(kind, handler, kindOpts?)` is at `server/src/platform/jobs.ts:62`, `enqueue(workspaceId, kind, payload): Promise<EnqueuedJob>` at `:67`, and `EnqueuedJob { id; done }` at `:31-35`;
  - rate-limit config: `server/src/modules/intent/routes.ts:24-27`;
  - `getContext` is at `server/src/modules/_shared/context.ts:14` and `IdParams` in `server/src/modules/_shared/schemas.ts`;
  - the registry is at `server/src/modules/index.ts:1-45`;
  - container getter + `resolveFeatureModelFor(workspaceId, 'onboarding')` pattern: `container.ts:253-262`, `:192-205`;
  - the error envelope `{ error: { code } }` for `AppError` comes from the handler at `server/src/app.ts:131+`.
- Change:
  - `routes.ts` (`export default async function onboardingRoutes`):
    - register `ONBOARDING_JOB_KIND` with handler `(payload) => service.generate(payload as OnboardingJobPayload, { logger: app.log })` and `{ timeoutMs: ONBOARDING_JOB_TIMEOUT_MS, retries: ONBOARDING_JOB_RETRIES }`;
    - `GET /repos/:id/onboarding` → `service.getState(workspaceId, id)`;
    - `POST /repos/:id/onboarding/generate` with `config: { rateLimit: GENERATE_RATE_LIMIT }` → `reply.code(202)`, `service.requestGeneration(...)`.
  - Container `get onboardingService()` **must be memoized** with `this._onboardingService ??= new OnboardingService({...})`, exactly like `intentService` (`container.ts:253-254`). The `inFlight` map lives on the instance; a fresh instance per access would break AC3 (cross-model review finding 4). Add `private _onboardingService?: OnboardingService;` beside `:108`. The routes take `const service = container.onboardingService` once at plugin load (`intent/routes.ts:16`).
  - Container `onboardingService` deps:
    - `repo: new OnboardingRepository(this.db)`, `repoIntel: this.repoIntel`, `rootFiles: this.rootFiles`;
    - `jobs: { enqueue: (ws, p) => this.jobs.enqueue(ws, ONBOARDING_JOB_KIND, p) }`;
    - `llm: (p) => this.llmSingleShot(p)` (a thin wrapper over `buildLlm(id, { singleShot: true })`, Step 8), `resolveModel: (ws) => this.resolveFeatureModelFor(ws, 'onboarding')`;
    - `systemPrompt: () => loadPromptTemplate('onboarding.system.md')`.
- Skills: `onion-architecture`, `fastify-best-practices`, `zod`, `security` — routes never touch DB/adapters; params schema; rate limit on AI generation.
- Done when:
  - `.claude/scripts/check-changed.sh server --full` passes with only the 8 known cycles;
  - `GET /repos/<seeded id>/onboarding` on a dev API returns `status: "none"` and `index.usable: false`;
  - `POST` on the seeded repo (no clone) returns 409 `repo_not_indexed`.
- Depends on: 6, 7, 8
- Agent: implementer — Phase: 2

### Step 10 — WORKSPACE nav item and active-key fix (vendored-nav exception)  (package: client)
- Covers: AC1
- Files:
  - `client/src/vendor/ui/nav.ts` — one WORKSPACE item (user-approved exception, spec line 510);
  - `client/src/components/app-shell/helpers.ts` — `activeKeyFor`;
  - `client/src/components/app-shell/nav.test.tsx` — update the pin (this test is named in the exception).
- Context:
  - `NAV` WORKSPACE is at `client/src/vendor/ui/nav.ts:21-27` (`{ key: "pulls", ..., href: "/repos/:repoId/pulls", gKey: "p" }`) and `resolveHref` at `:71-74`;
  - the active-key rule `if (pathname.includes("/onboarding")) return "onboarding-tour";` is at `client/src/components/app-shell/helpers.ts:29`;
  - the pin `expect(keysOf("WORKSPACE")).toEqual(["pulls"]);` is at `nav.test.tsx:11`;
  - the label key exists: `client/messages/en/shell.json:19` (`"onboarding-tour": "Onboarding Tour"`);
  - the command palette label uses `t(\`nav.${it.key}\`)` (`client/src/components/app-shell/hooks/useShellCommands.ts:24`).
- Change:
  - append `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "FileText", href: "/repos/:repoId/onboarding" }` after `pulls` (no `gKey`, so `SHORTCUTS` is untouched);
  - `activeKeyFor`: replace the `includes("/onboarding")` rule with `/^\/repos\/[^/]+\/onboarding(\/|$)/.test(pathname)` → `"onboarding-tour"`, so `/onboarding` falls through to `""`;
  - update the pin to `["pulls", "onboarding-tour"]`.
- Skills: `frontend-ui-architecture` — the vendored edit is limited to the approved item; pure helper.
- Done when: `.claude/scripts/check-changed.sh client` passes; the sidebar shows "Onboarding Tour" under WORKSPACE in dev.
- Depends on: none
- Agent: implementer — Phase: 3

### Step 11 — Client data hooks  (package: client)
- Covers: AC2 (state + Resync), AC3/AC4 (generate + polling), AC16 (error object reaches the view), NFR2 (poll interval)
- Files: `NEW client/src/lib/hooks/onboarding.ts`
- Context:
  - the pattern to copy is `client/src/lib/hooks/conventions.ts:17-62` (`conventionsQueryKey`, `refetchInterval` callback, mutation + `invalidateQueries`);
  - `api.get/post` are in `client/src/lib/api.ts`, and `ApiError { status; code? }` at `client/src/lib/api.ts:8-16`;
  - Resync reuse: `useResyncRepoIntel(repoId)` at `client/src/lib/hooks/repo-intel.ts:41-49`;
  - mutations always toast (`client/src/lib/providers.tsx:42`).
- Change:
  - `onboardingQueryKey(repoId)`;
  - `ONBOARDING_POLL_MS = 2_500` (24 req/min < 120);
  - `export function onboardingRefetchInterval(state: OnboardingState | undefined): number | false`, exported pure for tests;
  - `useOnboarding(repoId)` → `api.get<OnboardingState>(\`/repos/${repoId}/onboarding\`)` with `refetchInterval: (q) => onboardingRefetchInterval(q.state.data)`;
  - `onboardingRefetchInterval(state, opts?: { resyncPendingSince?: number | null; now?: number })` returns:
    - `ONBOARDING_POLL_MS` while `status === 'generating'`;
    - `ONBOARDING_POLL_MS` while a resync was triggered, `status === 'none'` and `!index.usable`, for at most `RESYNC_POLL_MAX_MS = 120_000` after `resyncPendingSince` (cross-model review finding 8);
    - `false` otherwise.
  - `useOnboarding(repoId, { resyncPendingSince })` passes that option through.
  - `useGenerateOnboarding(repoId)` → `api.post<OnboardingGenerateResponse>(...)`. `onSuccess` sets the cached state to `status: 'generating'` + `job_id`, **only if a cached state exists** (null-guard, cross-model review finding 18). `onSettled` invalidates.
  - `useResyncForOnboarding(repoId)` wraps `useResyncRepoIntel(repoId)`. Its `onSuccess` also invalidates `onboardingQueryKey(repoId)`, so `index.usable` refreshes, and the view records `resyncPendingSince = Date.now()`. A mutation-level `onSuccess` passed to `mutate()` is enough; `repo-intel.ts` is not edited.
  - Toast suppression via `meta` is **not** supported: `MutationCache.onError` always toasts (`client/src/lib/providers.tsx:41-43`), and changing providers is out of scope. Accepted risk, §6;
  - `import type` only from `@devdigest/shared`.
- Skills: `frontend-ui-architecture`, `react-best-practices` — one data path; conditional polling; server data in React Query.
- Done when: `tsc --noEmit` (client) passes.
- Depends on: 1
- Agent: implementer — Phase: 3

### Step 12 — i18n namespace `onboarding`  (package: client)
- Covers: NFR7; the string keys used by AC2, AC4, AC12, AC13, AC15, AC16
- Files: `client/messages/en/onboarding.json` — replace all content (no current consumer; grep found no `useTranslations("onboarding")`).
- Context: the current file is `client/messages/en/onboarding.json:1-17`; its `generate.body` names other sections (NFR7 says replace it); namespace files are picked up automatically (`AGENTS.md` i18n).
- Change: keys (camelCase, except the spec-mandated reason keys):
  - `crumb`;
  - `title` ("Onboarding for {name}");
  - `subtitle` ("Generated from index of {count} files · last refreshed {when}");
  - `toc.title` ("On this page");
  - `sections.{architecture,criticalPaths,runLocally,readingPath,firstTasks}`;
  - `actions.{generate,regenerate}`;
  - `empty.{title,body,notIndexedTitle,notIndexedBody,resync}`;
  - `status.generating`;
  - `notes.{stale,partialIndex,truncated,churnUnavailable,settingsLink}`;
  - `notes.skeleton.{index_degraded,index_failed,no_api_key,ai_failed}`;
  - `run.{copy,copied}` with `{command}`, and `run.reviewBeforeRunning` ("Commands come from the repository's own files. Review each one before you run it.");
  - `open` with `{path}`;
  - `errors.{rateLimited,notIndexed,generic,retry}`;
  - `architecture.{diagramAlt,nodesLabel,edgesLabel,noSummary}`;
  - `readingPath.score`;
  - `firstTasks.empty`.
- Skills: `frontend-ui-architecture` — strings only in the namespace file.
- Done when: valid JSON; the keys used in Steps 13–14 exist (`next build` is not run by the implementer).
- Depends on: none
- Agent: implementer — Phase: 3

### Step 13 — Route page and OnboardingView shell (states, header, TOC, notes, errors)  (package: client)
- Covers: AC2, AC4, AC12 (title, subtitle, TOC, order), AC13, AC16, NFR6 (`role="status"`, TOC focus), NFR8 (`/onboarding` untouched)
- Files:
  - `NEW client/src/app/repos/[repoId]/onboarding/page.tsx`;
  - `NEW client/src/app/repos/[repoId]/onboarding/_components/OnboardingView/OnboardingView.tsx`;
  - `NEW .../OnboardingView/styles.ts` (`export const s`, CSS variables only);
  - `NEW .../OnboardingView/constants.ts` (section order array, anchor ids, `COPIED_RESET_MS`);
  - `NEW .../OnboardingView/helpers.ts` (`formatRelativeTime`, `generateErrorKind(err): 'rateLimited' | 'notIndexed' | 'generic'`, `statusNotes(tour, isStale): NoteKey[]`, `sectionAnchors()`);
  - `NEW .../OnboardingView/index.ts` (named + default);
  - `NEW .../OnboardingView/_components/SectionCard/{SectionCard.tsx,index.ts}` (collapsible: header `<button aria-expanded>`, starts expanded);
  - `NEW .../OnboardingView/_components/TourToc/{TourToc.tsx,index.ts}` (anchors that move focus to the heading, `tabIndex={-1}` on headings);
  - `NEW .../OnboardingView/_components/StatusNotes/{StatusNotes.tsx,index.ts}` (one note per condition; settings link to `/settings/api-keys` for `no_api_key`).
- Context:
  - thin page pattern: `client/src/app/repos/[repoId]/conventions/page.tsx:1-9`;
  - view pattern (AppShell crumb, RepoNotFound, Skeleton, ErrorState, EmptyState, header actions): `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/ConventionsView.tsx:20-160`;
  - `useActiveRepo`, `useRepoNotFound` from `@/lib/repo-context` and `RepoNotFound` from `@/components/repo-not-found` (imports at `ConventionsView.tsx:7-9`);
  - `EmptyState({icon,title,body,cta,onCta,ctaLoading})` usage at `ConventionsView.tsx:139-146`;
  - `formatRelativeTime` precedent at `ConventionsView/helpers.ts` (copy; do not import across routes);
  - `ApiError.status/code` at `client/src/lib/api.ts:8-16`.
- Change: `OnboardingView({ repoId })`:
  - crumb `[{label: full_name}, {label: t('crumb')}]`;
  - `status === 'none'`: an `EmptyState` with exactly one CTA. If `index.usable`, "Generate" calls `generate.mutate()`. Otherwise "Resync" calls `useResyncForOnboarding(repoId)`, with the not-indexed title and body. On success it sets `resyncPendingSince` (React state; the user's action, not server data) so the page polls until `index.usable` flips or 120 s pass;
  - `generating`: a `<div role="status" data-onboarding-status>` with `status.generating`; Generate/Regenerate `disabled`; the stored tour is still rendered;
  - tour present: `h1` title, subtitle (`files_indexed`, relative `generated_at`), Regenerate button, `TourToc`, `StatusNotes`, five `SectionCard`s in `SECTION_ORDER` with ids from `constants.ts`; section bodies come from Step 14;
  - mutation error: an inline `<div role="alert" data-onboarding-error>` with `errors.<kind>`. `notIndexed` shows the Resync action; `generic` shows Retry. The tour stays rendered;
  - test hooks are `data-onboarding-section="<key>"`, `data-onboarding-note="<key>"`.
- Skills: `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` — thin page; nested children without own styles; domain rules (notes, error kind) in `helpers.ts`; derive, don't store.
- Done when: `.claude/scripts/check-changed.sh client` passes; in dev, `/repos/<seeded>/onboarding` shows the not-indexed empty state with Resync, and `/onboarding` still shows "Add a repository".
- Depends on: 10, 11, 12
- Agent: implementer — Phase: 3

### Step 14 — Section bodies: architecture, critical paths, run locally (copy), reading path, first tasks (Open)  (package: client)
- Covers: AC12 (content in cards), AC14, AC15, NFR5, NFR6 (accessible names, diagram text alternative)
- Files:
  - `NEW .../OnboardingView/_components/ArchitectureSection/{ArchitectureSection.tsx,index.ts}`;
  - `NEW .../OnboardingView/_components/RunLocallySection/{RunLocallySection.tsx,index.ts}` (owns the copied state per command);
  - `NEW .../OnboardingView/_components/FileEntryList/{FileEntryList.tsx,index.ts}` (shared by critical paths, reading path and first tasks);
  - `NEW .../OnboardingView/_components/OpenLink/{OpenLink.tsx,index.ts}` and `NEW .../OnboardingView/_components/TruncatedPath/{TruncatedPath.tsx,index.ts}`. These are folders, not a bare `atoms.tsx`, because `OpenLink` branches on an empty sha and both are asserted by tests (cross-model review finding 19; `references/this-repo.md` "bare-file escape hatch": anything with a branch gets a folder).
- Context:
  - `githubBlobUrl(repoFullName, sha, file)` is at `client/src/lib/github-urls.ts:24-37`;
  - `Markdown` is in `@devdigest/ui` (`client/src/vendor/ui/primitives/Markdown.tsx:6-42`, react-markdown + remark-gfm, no raw-HTML plugin);
  - `IconBtn`/`Button` come from `@devdigest/ui` (`client/src/vendor/ui/primitives/index.ts:3-4`);
  - the `MonoLink` gotcha is in `client/INSIGHTS.md`.
- Change:
  - Architecture: `<Markdown>{summary}</Markdown>`, or the `architecture.noSummary` text when null. Nodes and edges are rendered as plain-text lists (labels as text, never as diagram syntax), with a visible or visually-hidden text alternative listing nodes and edges.
  - `OpenLink`: `<a href={githubBlobUrl(full_name, tour.indexed_sha, path)} target="_blank" rel="noopener noreferrer" aria-label={t('open', { path })} data-onboarding-open>`. When `tour.indexed_sha === ''` it renders nothing: there is no commit to pin to, and the path stays visible as text (cross-model review finding 7).
  - `RunLocallySection` shows `run.reviewBeforeRunning` above the commands. README shell lines are repo-authored text that reaches the clipboard (cross-model review finding 16).
  - `TruncatedPath`: CSS ellipsis with `title={path}` and the full text in an accessible name (shown on hover and focus).
  - Copy button: `navigator.clipboard.writeText(command)`, then the accessible name switches from `run.copy` to `run.copied`, and resets after `COPIED_RESET_MS`; `data-onboarding-copy`.
  - Reading path shows `reason` and `score`. First tasks show title, why, and paths with `OpenLink`.
  - Never use `dangerouslySetInnerHTML`.
- Skills: `frontend-ui-architecture`, `react-best-practices`, `security` — stateful pieces get folders; no raw HTML; safe `target=_blank`.
- Done when: `.claude/scripts/check-changed.sh client --full` passes.
- Depends on: 13
- Agent: implementer — Phase: 3

## 5. Test plan
- Existing suites to run:
  - per step: `.claude/scripts/check-changed.sh server` / `client` (related tests);
  - end of each phase: `--full`;
  - Docker suites: `.claude/scripts/check-changed.sh server --it` runs NEW `server/test/onboarding.it.test.ts` plus existing `server/test/blast.it.test.ts`, `server/test/conventions-*.it.test.ts` (they use the repo-intel stub changed in Step 2);
  - e2e: `cd e2e && npm run typecheck`. Running the flows needs `./scripts/e2e.sh`, which is gated on pnpm and broken here (see §7).
- Tests to add or change:
  - `server/test/contracts.test.ts` — covers AC12, NFR8:
    - `OnboardingTour` parses an `ai` fixture and a `skeleton` fixture (`summary: null`, `first_tasks: []`);
    - `OnboardingState` parses `none`/`generating`/`ready`;
    - an old-shape `{sections:[...]}` fails `OnboardingTour.safeParse`;
    - NFR8: read both `knowledge.ts` files from disk and assert the text from `// ---- Onboarding ----` up to `// ---- Eval ----` is identical.
    - Lane: hermetic. Owner: test-writer.
  - NEW `server/test/onboarding-domain.test.ts` — covers AC6, AC7, AC9 (gating), NFR4, NFR10:
    - AC6: the fixture graph orders by `pagerank×(1+hotness)` desc with path tie-break; junk is filtered; 10 kept of 15; all kept when fewer than 6; hotness changes the order; `groundModelSections` keeps that order whatever the model returns;
    - AC7: 1 invented path plus 1 invented command gives `droppedPaths === 2` and neither appears in the sections; a near-miss command (extra space) is dropped;
    - candidate derivation: pnpm/yarn/npm inference, compose services, Makefile targets, README section lines;
    - NFR4: the candidates and the facts never contain a `.env.example` value (presence only);
    - NFR10: `buildSkeletonSections` is deep-equal across two runs;
    - `skeletonReasonForIndex` truth table, including `rankedCount: 0` → `index_degraded`;
    - grounding count enforcement: 7 model tasks are sliced to 5; 2 surviving tasks are kept as 2; 13 nodes are sliced to 12.
    - Lane: hermetic. Owner: test-writer.
  - NEW `server/test/onboarding-prompt.test.ts` — covers AC8, NFR3:
    - facts for 5,000 file entries give `estTokens ≤ 12_000` and `truncated === true`; small facts give `false`;
    - NFR3: remove every `<untrusted source="...">…</untrusted>` block from the user message; no fixture path, README text or command remains; each source label is distinct;
    - non-file caps: 500 candidate commands, 500 deps and a 1 MB README give at most 60 / 40 / 4,000 chars in the prompt; a fixed part forced over budget (for example `budget: 100`) gives `overBudget: true`;
    - finding 1: `JSON.stringify(toJsonSchema(OnboardingModelOutput, 'OnboardingTour').schema)` contains neither `minItems` nor `maxItems` (`toJsonSchema` is imported from `server/src/platform/structured.ts`).
    - Lane: hermetic. Owner: test-writer.
  - NEW `server/test/onboarding-service.test.ts` (fakes of every port, no `pg.ts`) — covers AC3 (unit), AC5, AC9, AC10 (unit), AC11, NFR1, NFR4, NFR9:
    - AC5: a `full` index plus a key gives exactly 1 `completeStructured` call with `maxRetries: 0`, `maxTokens: 4000`, `timeoutMs: 90000`; saved `outcome: 'ai'`, `llm_calls: 1`; `partial` behaves the same (EC4);
    - AC9: `degraded` with clone → `index_degraded`, 0 calls; `failed` → `index_failed`, 0 calls; `filesIndexed: 0` → `index_degraded`; `ConfigError` from `llm()` → `no_api_key`, 0 calls; a throw → `ai_failed`; a never-resolving call with `limits.llmTimeoutMs: 20` → `ai_failed`, `llm_calls: 1`. In every skeleton, `architecture.summary === null` and `first_tasks` is empty. EC15: an `ai` tour is overwritten by a skeleton;
    - AC11: exactly one `info` record with `event: 'onboarding.generated'` and exactly the 12 keys; `cost_usd: null` when the provider returns null (not 0); no record value contains prompt text, a README string or a fake secret;
    - AC3 (unit): two `requestGeneration` calls without awaiting give one `enqueue` and the same `job_id`;
    - AC10 (unit): `clonePath: null` or `hasIndexState: false` → `RepoNotIndexedError`, `enqueue` not called, no log record;
    - finding 5: the first `enqueue` rejects, so `requestGeneration` rejects; the next `requestGeneration` calls `enqueue` again and succeeds;
    - finding 6: `getRankedFiles` throws a plain `Error`, so `saveTour` receives an `ai_failed` skeleton and exactly one `onboarding.generated` record is written; with `saveTour` also throwing, the generated line is still written once plus one `warn`;
    - finding 2: facts whose fixed part is over budget give 0 LLM calls and `skeleton_reason: 'ai_failed'`;
    - finding 7: `lastIndexedSha: ''` gives stored `indexed_sha: ''`, and `getState` returns `is_stale: false`;
    - finding 14: `full` state with `getRankedFiles → []` gives `index_degraded` and 0 calls.
    - Lane: hermetic. Owner: test-writer.
  - NEW `server/test/onboarding-root-files.test.ts` (tmp dir via `mkdtemp`, no DB) — covers NFR4, OQ1:
    - reads `package.json`/`Makefile`/`docker-compose.yml`/`README.md`;
    - a 70 KB `package.json` gives `skipped: too_large`;
    - `.env.example` containing `SECRET=sk-live-XYZ` gives `hasEnvExample: true` and the serialized snapshot does not contain `sk-live-XYZ`;
    - a symlinked `Makefile` is ignored; a missing root gives `null`.
    - Lane: hermetic. Owner: test-writer.
  - NEW `server/test/llm-single-shot.test.ts` — covers AC5 (one HTTP request), finding 9:
    - `container.llmSingleShot('openrouter')` with an injected override returns the override;
    - with `MockSecretsProvider` keys and no override, for each of `openrouter`, `openai`, `anthropic`, `llmSingleShot` constructs the provider with retries off. Spy on the constructors with `vi.mock` of `@devdigest/reviewer-core` (OpenRouter: `{ maxRetries: 0, timeoutMs: 90000, estimateCost: fn }`) and of the adapter modules (OpenAI/Anthropic: `{ transportRetries: 0 }`). This is an adapter-boundary mock, allowed by `references/testing.md` "adapters";
    - `OpenAIProvider` and `AnthropicProvider` built with `{ transportRetries: 0 }` and a stubbed client that rejects once with a retryable error make exactly 1 attempt;
    - `container.llm('openrouter')` still constructs with no `maxRetries` (default unchanged);
    - two `llmSingleShot` calls return distinct instances (uncached).
    - Lane: hermetic. Owner: test-writer.
  - NEW `server/test/onboarding.it.test.ts` (imports `test/helpers/pg.ts`; `buildApp` with `overrides: { repoIntel: stub with full state + ranked files, rootFiles: fake, llm: { openrouter: gated fake provider } }`) — covers AC3, AC10, NFR2, NFR8, EC13, EC17:
    - AC3: two POSTs 100 ms apart both return 202 with the same `job_id`. The provider is held on a deferred promise until after the second POST, then released. After `jobs.onIdle()` the provider has 1 call and GET returns `ready`;
    - AC10: a repo with `clone_path NULL` gives 409 `{error:{code:'repo_not_indexed'}}`; a stub `hasIndexState: false` gives 409; there is no `jobs` row with kind `onboarding-generate`;
    - unknown repo: GET/POST → 404;
    - finding 23: a non-uuid id (`/repos/not-a-uuid/onboarding`) gives 422 `validation_error` (`IdParams` is `z.string().uuid()`, `server/src/modules/_shared/schemas.ts:11`);
    - NFR8/EC13: a raw `onboarding` row with `{sections:[...]}` gives GET 200 `status: 'none'`, `tour: null`;
    - EC17: deleting the repo removes the row;
    - NFR2 (finding 11), in its **own `describe` with its own app**:
      - `loadConfig({ ...process.env, NODE_ENV: 'development', API_HOST: '127.0.0.1' })`; `NODE_ENV=development` is allowed by `server/src/platform/config.ts:41`, and the explicit host avoids the prompt-log boot warning;
      - the same gated fake LLM, so the first POST's job stays in flight and every POST joins it;
      - 10 POSTs return 202 and the 11th within the minute returns 429;
      - release the gate and close the app in `afterAll`.
    - Lane: it. Owner: test-writer.
  - `client/src/components/app-shell/nav.test.tsx` (updated in Step 10 by the implementer; extended by test-writer) — covers AC1: WORKSPACE keys are `["pulls","onboarding-tour"]`; `resolveHref(item.href, "r1") === "/repos/r1/onboarding"`; `render(<Sidebar ctx={{ repoId: "r1" }} />)` renders "Onboarding Tour" under WORKSPACE with `href="/repos/r1/onboarding"`. Without `repoId` the href resolves to `/repos/_/onboarding` (`client/src/vendor/ui/nav.ts:71-74`, `Sidebar.tsx:64`; finding 17). Lane: client. Owner: test-writer.
  - NEW `client/src/components/app-shell/helpers.test.ts` — covers AC1: `activeKeyFor('/repos/r1/onboarding') === 'onboarding-tour'`; `activeKeyFor('/onboarding') !== 'onboarding-tour'`. Lane: client. Owner: test-writer.
  - NEW `client/src/app/repos/[repoId]/onboarding/_components/OnboardingView/OnboardingView.test.tsx` (mock `@/components/app-shell`, `@/lib/repo-context`, `@/lib/hooks/onboarding`, `@/lib/hooks/repo-intel` per `ConventionsView.test.tsx:7-42`; `NextIntlClientProvider` with `onboarding.json`) — covers AC2, AC4, AC12, AC13, AC14, AC15, AC16, NFR5, NFR6, NFR7:
    - AC2: `none` + usable shows exactly one Generate button and no Resync; `none` + not usable shows exactly one Resync, which calls the resync mutate;
    - AC4: `generating` shows `role="status"`, the buttons are `disabled`, and the previous section text is still in the DOM;
    - AC12: headings appear in the five-section order; every card header has `aria-expanded="true"`; the subtitle contains the file count; TOC has 5 anchors;
    - AC13: one note per true condition; `churnUnavailable` always shown when `churn_available=false`; `no_api_key` links to `/settings/api-keys`;
    - AC14: the Open link has `href === githubBlobUrl(full_name, indexed_sha, path)`, `target="_blank"`, and `rel` contains `noopener`; with `indexed_sha: ''` there is no Open link and the path text is still shown (finding 7);
    - finding 8: clicking Resync calls the resync mutation and then triggers the onboarding refetch (assert the `onSuccess` invalidation / refetch spy);
    - finding 16: the `run.reviewBeforeRunning` text is shown in the run-locally card;
    - AC15: `navigator.clipboard.writeText` is stubbed and called with the exact command; the button's accessible name switches to the copied text;
    - AC16: mutation error 429 → `rateLimited`, 409 `repo_not_indexed` → `notIndexed` + Resync, 500 → `generic` + Retry; the tour stays rendered;
    - NFR5: a summary containing `<script>` and `<img onerror>` creates no `script`/`img` element; a long path exposes its full text through `title`/accessible name;
    - NFR6: the copy and Open accessible names include the command or path; the diagram text alternative lists nodes and edges.
    - Lane: client. Owner: test-writer.
  - NEW `client/src/app/repos/[repoId]/onboarding/_components/OnboardingView/helpers.test.ts` — covers AC13, AC16: `statusNotes` truth table; `generateErrorKind` mapping. Lane: client. Owner: test-writer.
  - NEW `client/src/lib/hooks/onboarding.test.ts` — covers NFR2 and finding 8. `onboardingRefetchInterval` returns:
    - 2500 for `generating`;
    - 2500 for `none` + `!usable` + `resyncPendingSince` within 120 s;
    - `false` for the same state after 120 s, without a pending resync, or for `ready`.

    That is at most 24 req/min per tab. Lane: client. Owner: test-writer.
  - NEW `e2e/specs/08-onboarding-tour.flow.json` — covers AC2 (e2e web), AC1 (navigation), NFR8:
    - open `{BASE}/`, `wait --url /pulls`;
    - `find text "Onboarding Tour" click`;
    - `wait --text` the `empty.notIndexedTitle` string, then `wait --text` the `empty.resync` label (the seeded repo has `clonePath: null`, `server/src/db/seed.ts:93`);
    - do not click Resync (read-only flow);
    - do not use `wait --url "/onboarding"` alone, because it also matches the Add-repository route.

    `06-onboarding.flow.json` is unchanged and must stay green. Lane: e2e. Owner: test-writer.
- Needs Docker: yes, for `server/test/onboarding.it.test.ts` and the existing `*.it.test.ts` that use the changed stub. Everything else is hermetic or client.

## 6. Risks and open questions
- Q1–Q4: decided. The orchestrator accepted the defaults; they are recorded in §0 "Answered implementation questions".
- Risk: duplicate error surfacing. Mutations always toast (`client/src/lib/providers.tsx:41-43`), and the `MutationCache` has no `meta` opt-out, so AC16's inline alert appears together with a toast. Mitigation: accepted risk; providers are out of scope and ux-review may flag it.
- Risk: the per-route rate limit is not registered under `NODE_ENV=test` (`server/src/app.ts:110-112`). Mitigation: the NFR2 it-test uses its own app with `NODE_ENV: 'development'`, which the config schema accepts (`server/src/platform/config.ts:41`), and `API_HOST: '127.0.0.1'`.
- Risk: the JobRunner 120 s timeout (`jobs.ts:49`) rejects the job promise but does not cancel the handler. Mitigation: the LLM call is bounded at 90 s by `withTimeout`, and fact collection is DB reads plus ≤ 64 KB file reads.
- Risk: when the DB itself is down, the infrastructure-error path (Step 7) cannot save the skeleton. Mitigation: the AC11 line is still written from `finally`, plus one metadata-only `warn`.
- Risk: README shell lines are repo-authored text that ends up copyable. Mitigation: AC7 exact-match against candidates (the model cannot add commands), copy-only (NG6), and the "review before running" note (Step 14). Added to the security-reviewer focus in §8.
- Risk: the in-flight map is per process (EC14 accepts this). A second API instance would not join. Out of scope (local-first, single process).
- Spec gaps 1–7 in §0 are routed to spec-creator. None blocks.

## 7. Not verified
- Whether react-markdown 9 without `rehype-raw` shows raw HTML as text or drops it (NFR5 wording). Searched: `client/src/vendor/ui/primitives/Markdown.tsx`, `client/package.json:24-26`; library docs not read.
- Whether OpenRouter/OpenAI strict mode rejects `minItems`/`maxItems`. This is moot now that the model schema has no array bounds (finding 1); `toJsonSchema` = `zodResponseFormat` was confirmed at `reviewer-core/src/llm/structured.ts:19-22`, and the hermetic test asserts the bounds are absent.
- Whether the rate-limit plugin's in-memory store resets between it-suite apps. No existing 429 test exists (grep `429` in `server/test`).
- Whether the client copy of `knowledge.ts` is byte-identical to the server copy outside lines 28-47. Grep showed the same Onboarding line numbers in both; a full diff was not run (no Bash).
- Whether the e2e flows can run in this environment. `scripts/e2e.sh` gates on `command -v pnpm` (`AGENTS.md`), which is broken here; only `npm run typecheck` in `e2e/` is runnable.
- That `file_rank` holds every walked file (the "indexed file set" used for grounding). Inferred from `computeFileRank(walk.files, edgeRows)` at `server/src/modules/repo-intel/pipeline/full.ts:228`; not confirmed for the incremental path (`pipeline/incremental.ts` not read).
- The exact `EmptyState` prop names beyond `icon/title/body/cta/onCta/ctaLoading` (usage at `ConventionsView.tsx:139-146`); the component source was not read.

## 8. Execution mode
- Mode: multi-agent. Chosen by: user (input).
- Phases (each is one fresh `implementer` run, one commit):
  - Phase 1 — server (contract + facts) — steps 1, 2, 3, 4 — check: `.claude/scripts/check-changed.sh server client` per step, `--full` at the end (Step 1 also touches the client vendored copy).
  - Phase 2 — server (generation + route + log) — steps 5, 6, 7, 8, 9 — check: `.claude/scripts/check-changed.sh server`, `--full` at the end; optional `--it` smoke if Docker is up.
  - Phase 3 — client (nav + page) — steps 10, 11, 12, 13, 14 — check: `.claude/scripts/check-changed.sh client`, `--full` at the end.
  - e2e is not an implementer phase (Q3). `test-writer` writes `e2e/specs/08-onboarding-tour.flow.json` with the other tests. The orchestrator may commit the e2e file separately.
- Hand-off order (one writer at a time on this checkout; no worktree needed because the writers run sequentially):
  1. `implementer` — Phase 1 — input: this plan §1–§4 steps 1–4 — output: code + `check-changed.sh` PASS lines.
  2. `implementer` — Phase 2 — input: steps 5–9 — output: same.
  3. `implementer` — Phase 3 — input: steps 10–14 — output: same.
  4. `node .claude/skills/pr-self-review/scripts/bundle.mjs write`, then `plan-verifier` (scope `code`) — input: plan + `.devdigest/cache/review-bundle/summary.md` — output: a Plan Verification Report. Not-met items go back to `implementer`.
  5. `architecture-reviewer` and `security-reviewer` in parallel (read-only) — input: the bundle — output: reports + Findings JSON. Fixes go back to `implementer` before tests.
     - Security focus: prompt injection (NFR3), `.env.example` (NFR4), model paths/commands (AC7), README shell-line candidates reaching the clipboard (finding 16), XSS (NFR5), log content (NFR9), rate limit (NFR2), workspace scoping in `findRepo`.
  6. `test-writer` — input: §5 — output: all tests in §5, including the e2e flow; runs `check-changed.sh server client --full` and `server --it`.
  7. `plan-verifier` (scope `final`) — input: the plan + the scope-code report — output: a verdict. Not-met items go back to `implementer` or `test-writer`.
  8. `doc-writer` (after COMPLETE):
     - `server/README.md` API map (2 endpoints);
     - `client/README.md` route map (`/repos/[repoId]/onboarding`);
     - `e2e/README.md` coverage table (flow 08);
     - the two INSIGHTS entries recommended in §0 via `engineering-insights`.
- Parallel: only step 5 (two read-only reviewers). No writer runs concurrently with another writer; `isolation: "worktree"` is not needed.
- Gates: `check-changed.sh` PASS per phase (the 8 known cycles only); plan-verifier `code` before reviews; reviewers' CRITICAL/HIGH fixed before tests; plan-verifier `final` COMPLETE before docs; `/pr-self-review` before the PR (no CRITICAL).

## Cross-model review
Reviewer: Sonnet. Verdict: ready-with-fixes. Each finding was checked against the code before it was applied. Findings 10, 13, 20 and 21 were left to the planner's judgement and not raised again; no change.

| # | Finding | Verified against | Resolution |
|---|---|---|---|
| 1 | No array bounds in `OnboardingModelOutput`; counts enforced in grounding; test that the JSON schema has no `minItems`/`maxItems` | `reviewer-core/src/llm/structured.ts:19-22` (`zodResponseFormat`) | fixed — Steps 4, 5; §5 prompt test; spec gap 3 updated |
| 2 | Bound every non-file prompt block; skeleton when still over budget | Step 5 design (README up to 4k chars, unbounded candidates and deps) | fixed — Steps 4, 5, 7; §5 prompt + service tests; spec gap 6 (`ai_failed` with 0 calls) |
| 3 | O(n²) drop-and-re-render loop | Step 5 design | fixed — linear prefix fit, Step 5 |
| 4 | Memoize the `onboardingService` getter | `container.ts:253-254` (`??=` pattern) | fixed — Step 9 |
| 5 | Clear the in-flight entry when `enqueue` rejects | `jobs.ts:67-75` (`enqueue` awaits a DB insert and can reject) | fixed — Step 7; §5 service test |
| 6 | An infrastructure error must still leave a tour and a log line | `jobs.ts:108-119` (only a redacted job row before) | fixed — Step 7; §5 service test; spec gap 7 |
| 7 | Empty `lastIndexedSha` | `repo-intel/pipeline/full.ts:88`, `repo-intel/service.ts:199` | fixed — keep `''` (no fake sha), hide the Open link, `is_stale` false; Steps 7, 14; §5 tests. The branch-name fallback was rejected because it would show a sha-less link as if pinned |
| 8 | Resync must refresh onboarding state and poll until usable | `client/src/lib/hooks/repo-intel.ts:41-49` invalidates only `repo-intel-state` | fixed — Steps 11, 13 (bounded at 120 s); §5 hook + view tests |
| 9 | Single-shot tests for all three providers; fold into `buildLlm` | `container.ts:338-358` | fixed — Step 8; §5 `llm-single-shot.test.ts` |
| 11 | 429 test in its own describe/app with development config, explicit `API_HOST`, gated LLM | `app.ts:110-112`; `config.ts:32,41` | fixed — §5 it-test; §6/§7 updated |
| 12 | Map `filePath` → `path`; gate `hasIndexState` on `repoIntelEnabled` | `repository.ts:99-103`; `service.ts:647` | fixed — Step 2 |
| 14 | An empty ranked set is `index_degraded` | `pipeline/full.ts:211-230` | fixed — Step 4; §5 tests; still routed as spec gap 2 |
| 15 | README pick rule | Step 3 regex matches several names | fixed — Step 3 (prefer `README.md`, otherwise sorted) |
| 16 | README shell-line candidates: security focus + "review before running" copy | Step 4 candidate derivation | fixed — Steps 12, 14; §6; §8 security focus |
| 17 | The Sidebar test must pass a repo in `ctx` | `client/src/vendor/ui/shell/Sidebar.tsx:64` (`repoId={ctx.repoId}`), `nav.ts:71-74` | fixed — §5 `nav.test.tsx` (`ctx={{ repoId: "r1" }}`) |
| 18 | Null-guard the optimistic cache write; silent toast via `meta` | `client/src/lib/providers.tsx:41-43` (no `meta` handling) | null-guard fixed (Step 11); silent toast is an accepted risk (§6), since providers are out of scope |
| 19 | `OpenLink`/`TruncatedPath` as folders | `frontend-ui-architecture/references/this-repo.md` "bare-file escape hatch" | fixed — Step 14 |
| 22 | Grep before removing `Onboarding*` | grep over `reviewer-core/src`, `mcp/src`, `e2e`, `docs`: no consumers | fixed — Step 1 Context |
| 23 | A non-uuid `:id` returns 422 | `server/src/modules/_shared/schemas.ts:11`, `app.ts:131-141` | fixed — §5 it-test |
