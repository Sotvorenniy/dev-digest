# Implementation Plan: Export to CI (SPEC-09)

## 0. Spec readiness
- Source: `specs/2026-10-23-export-to-ci.md`, SPEC-09, Status `approved`.
- Spec readiness: ready ACs AC1–AC18; blocked ACs None.
- Spec gaps routed to spec-creator: None.
- Answered implementation questions:
  - Execution mode — **multi-agent**.
  - YAML serialization — **(a)** manifest written as `JSON.stringify(manifest, null, 2)` into `.devdigest/agents/<slug>.yaml` (JSON is YAML 1.2; the runner's `parseYaml` reads it, `agent-runner/src/manifest.ts:62`); the workflow is a fixed template string with only validated enum values interpolated. No new dependency.
  - Wizard dialog — **(a)** own dialog shell in the wizard folder: `role="dialog"`, `aria-modal`, `aria-labelledby`, Tab/Shift+Tab focus trap, Escape closes. Vendor `Modal` is not used (it has no focus trap / accessible name, `client/src/vendor/ui/kit/Modal.tsx:25-27`, and `client/src/vendor/ui/*` is not editable).
  - Test lane — **(a)** Docker available: `*.it.test.ts` with testcontainers + `MockGitHubClient` for the DB-backed ACs. (Tests are a follow-up in this run, see §5 and §8.)
  - Rate limit — **yes**: module-local `AppError` with status 429 and code `rate_limited`.
- Workflow constraints from the user (binding, see §8): max 5 implementer runs in total; implementer writes no tests and `test-writer` is off (the §5 test plan is a follow-up, listed but not executed); review options proposed in §8; fix loop at most 2 iterations and at most 2 spawned subagents.
- Recommendations:
  - One migration: `pr_url` + unique index on `ci_installations.repo` — accepted (in scope, Step 2).
  - Reuse the GitHub adapter unchanged (`commitFiles` / `findOpenPr` / `openPullRequest`) — accepted (Step 6).
  - Runner bundle read through an injected port — accepted (Steps 4, 6, 7).
  - Smallest client surface (one CI tab + one wizard; no `/ci-runs`, no nav change) — accepted.

## 1. Goal and scope
- Goal: from the agent editor's new CI tab, a user previews the exact GitHub Actions files for one agent and installs them into one imported repo through a PR that DevDigest opens (re-install updates the same branch/PR); the tab lists installations and sets `ci_fail_on`.
- In scope:
  - `pr_url` (nullish) on `CiInstallation` in both `shared` copies.
  - New migration: `ci_installations.pr_url` + unique index `ci_installations_repo_uq`.
  - New server module `server/src/modules/ci/`: `POST /agents/:id/export-ci`, `GET /agents/:id/ci-installations`.
  - Runner bundle reader adapter (reads the pre-built `agent-runner/dist/index.js`).
  - Client: data hooks, `ci` i18n keys, CI tab, 4-step Export wizard with its own dialog shell.
- Out of scope: everything in spec NG1–NG13 (other targets, ingest, `/ci-runs` page, zip, editable preview, secrets/branch protection automation, memory.jsonl, attribution, GitHub App, `any` in CI tab, uninstall, "Update CI config" button, multi-agent per repo, non-OpenRouter). No change to `agent-runner/`, `reviewer-core/`, `findings.ts`, sidebar `NAV`, `client/src/vendor/ui/*`, the GitHub adapter. No new dependencies. No tests in this run (follow-up).
- AC coverage (tests are follow-up items from §5; lane in brackets):
  - AC1 — Steps 10 — `CiTab.test.tsx` [client]
  - AC2 — Steps 1, 2, 5, 6, 7, 8, 10 — `ci.it.test.ts` [it] + `CiTab.test.tsx` [client]
  - AC3 — Step 10 — `CiTab.test.tsx` [client]
  - AC4 — Step 11 — `CiTab.test.tsx` [client]
  - AC5 — Step 11 — `CiTab.test.tsx` [client]; EC16 404 in `ci.it.test.ts` [it]
  - AC6 — Steps 3, 6, 7, 11 — `ci-service.test.ts` [hermetic] + `ci.it.test.ts` [it] + `CiTab.test.tsx` [client]
  - AC7 — Step 3 — `ci-domain.test.ts` [hermetic]
  - AC8 — Step 3, 7 — `ci-domain.test.ts` [hermetic]
  - AC9 — Step 3 — `ci-domain.test.ts` [hermetic]
  - AC10 — Steps 7, 11 — `CiTab.test.tsx` [client]; 422 on empty triggers in `ci.it.test.ts` [it]
  - AC11 — Step 11 — `CiTab.test.tsx` [client]
  - AC12 — Steps 2, 5, 6, 7, 11 — `ci.it.test.ts` [it] + `CiTab.test.tsx` [client]
  - AC13 — Steps 2, 5, 6 — `ci.it.test.ts` [it]
  - AC14 — Steps 3, 6, 11 — `ci-service.test.ts` [hermetic] + `CiTab.test.tsx` [client]
  - AC15 — Step 11 — `CiTab.test.tsx` [client]
  - AC16 — Steps 2, 3, 5, 6, 11 — `ci.it.test.ts` [it] + `CiTab.test.tsx` [client]
  - AC17 — Steps 3, 6, 11 — `ci-service.test.ts` [hermetic] + `CiTab.test.tsx` [client]
  - AC18 — Step 3 — `ci-domain.test.ts` [hermetic]
  - NFRs: NFR1 Step 7 (manual/dev-app only, `server/INSIGHTS.md:288`); NFR2 Steps 3, 6; NFR3 Step 3; NFR4 Step 3; NFR5 Step 6; NFR6 Step 11; NFR7 Steps 9–11; NFR8 Step 6; NFR9 Steps 1, 12.

## 2. Applicable constraints
- INSIGHTS entries:
  - `INSIGHTS.md` — "A contract field added to RunStats must be optional, not just nullable" — `pr_url` must be `.nullish()` (older rows / transient install have none).
  - `INSIGHTS.md` — "The implementer cannot apply a plan-sanctioned vendor edit" — the hook allows only the paired `shared` contracts; `client/src/vendor/ui/*` stays untouched (hence our own dialog shell).
  - `INSIGHTS.md` — "Agent path-guard hooks resolve paths against the session cwd" — the orchestrator stays at repo root when spawning the implementer.
  - `INSIGHTS.md` / `server/INSIGHTS.md` — "pnpm is broken" — use `./node_modules/.bin/drizzle-kit generate`, `tsc --noEmit`, `vitest run`.
  - `server/INSIGHTS.md` — "A per-route `rateLimit` never fires under NODE_ENV=test" — NFR1 is not testable in the normal test app; config only.
  - `server/INSIGHTS.md` — "`body: Schema.optional()` rejects an empty POST" — the export body is required; no `.optional()` body.
  - `server/INSIGHTS.md` — "`reviews.it.test.ts` and the conventions rescan test fail on a clean HEAD" / "Run-driven IT tests flake" — do not blame this change for those two `--it` failures.
  - `client/INSIGHTS.md` — "A repo-name slugifier silently truncates text with a '/'" — the slug transform has no path-splitting step (NFR3).
  - `client/INSIGHTS.md` — "A component that gains a TanStack Query hook breaks its old smoke tests" — `AgentEditor.test.tsx` renders the tab bar only; CiTab mounts only on `tab="ci"`, but if an existing test breaks, wrap in `QueryClientProvider` and load the `ci` namespace.
  - `client/INSIGHTS.md` — "`@testing-library/user-event` is not installed" — relevant to the follow-up tests only.
- Architecture / AGENTS.md rules:
  - Onion: `routes → service → ports/domain ← repository/adapters`; only `platform/container.ts` builds concrete classes; routes never touch db/adapters (bites Steps 4–7).
  - Adding a module = one import + one entry in `server/src/modules/index.ts`.
  - Contract change edits both `server/src/vendor/shared` and `client/src/vendor/shared`; only `pr_url` is allowed (spec "Ownership").
  - Migrations only via `drizzle-kit generate`; never hand-written (implementer path guard denies `server/src/db/migrations/*` edits; running the CLI is fine).
  - Drizzle naming: unique index suffixed `_uq`.
  - Client: `@devdigest/shared` is type-only (no runtime import from it); `data-<thing>` hooks, never `data-testid`; strings in `client/messages/en/ci.json`; component folder layout; inline style objects + CSS variables, no Tailwind.
  - Secrets only via `SecretsProvider` (`container.github()` already does this, `server/src/platform/container.ts:416-423`).
- Do-not-touch items near this change: `agent-runner/**`, `reviewer-core/**`, `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`, `server/src/db/migrations/**` (except the generated new files), `client/src/vendor/ui/**` (incl. `kit/Modal.tsx`, `ExportWizardSteps.tsx` — use as-is), `client/src/components/app-shell/**` (nav), `server/src/vendor/shared/contracts/findings.ts`, lockfiles, `specs/**`.

## 3. Skill assignments
| Step | Skills the executing agent must read | Rules that shape this step |
|---|---|---|
| 1 | `zod` | Contracts: PascalCase const + same-name `z.infer` type; `.nullish()` for optional-or-null (root `AGENTS.md` "Contracts"); both copies identical. |
| 2 | `drizzle-orm-patterns`, `postgresql-table-design` | "Use `generate` + `migrate`" (drizzle-orm-patterns SKILL.md:114); unique index `_uq` (root `AGENTS.md` Drizzle naming); never edit/rename a generated migration. |
| 3 | `onion-architecture`, `security` | `domain.ts` is Core: pure functions, domain errors subclass `AppError`, no fastify/drizzle/SDK/runtime zod (onion SKILL.md "The files of a module"); A05 injection: only enumerated values reach the workflow, A01 path traversal: safe slugs (security SKILL.md). |
| 4 | `onion-architecture` | Module-local ports in `modules/<m>/ports.ts`; a port never exposes infrastructure types (`$inferSelect`, Octokit) — CRITICAL; reuse `GitHubClient` from shared adapters, never edit it (onion "Decisions" 1). |
| 5 | `onion-architecture`, `drizzle-orm-patterns` | Repository implements the port, maps rows → domain (`toDomain`) in the repository (MEDIUM rule); must not import `routes.ts`/`service.ts`. |
| 6 | `onion-architecture`, `security` | Service takes a narrow deps object, never `Container` (onion Workflow 3); errors via the `AppError` taxonomy, no `reply.status` in the service (HIGH); A09: log metadata only, never tokens or file contents. |
| 7 | `onion-architecture`, `fastify-best-practices`, `zod`, `security` | Routes parse with Zod at the boundary and call the service only (CRITICAL: no `container.db`/adapters in routes); per-route `config.rateLimit` 10/min (A06); wiring only in `platform/container.ts`; module registered statically. |
| 8 | `frontend-ui-architecture`, `react-best-practices` | Data hooks live in `client/src/lib/hooks/`; components never `fetch`: `lib/api.ts → lib/hooks/* → component`; server data stays in TanStack Query, not `useState` (frontend-ui-architecture "Where business logic lives"). |
| 9 | `frontend-ui-architecture` | i18n: one file per namespace, camelCase keys nested by UI surface; no inline strings in JSX. |
| 10–11 | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `security` | Colocation first; nested `_components/` children are `Name.tsx` + named-only `index.ts`, sharing the parent's `styles.ts` / `constants.ts` / `helpers.ts` (`references/this-repo.md:91-96`); domain rules as plain functions in `helpers.ts`; derive instead of store; `'use client'` at the leaf; XSS: GitHub-sourced text rendered as text, `pr_url` only as an `https://github.com/` link (security A05). |
| 12 | — | Verification commands only. |

## 4. Steps

### Step 1 — Add `pr_url` to `CiInstallation` in both shared copies  (package: server + client contracts)
- Covers: AC2, AC12 (prerequisite of Steps 5–7, 10); NFR9
- Files: `server/src/vendor/shared/contracts/eval-ci.ts`, `client/src/vendor/shared/contracts/eval-ci.ts`
- Context: server `CiInstallation` at `server/src/vendor/shared/contracts/eval-ci.ts:188-195`; client copy at `client/src/vendor/shared/contracts/eval-ci.ts:159-166`. Both currently end with `installed_at: z.string(),`. The implementer path guard allows exactly these paired files.
- Change: add `pr_url: z.string().nullish(),` after `installed_at` in both. Nothing else in shared (the client copy keeps lacking `AgentManifest`; do not "fix" the drift).
- Skills: `zod` — `.nullish()` for optional-or-null; identical in both copies.
- Done when: the CI section of both files differs only by the pre-existing `AgentManifest` block; `tsc --noEmit` passes in server and client.
- Depends on: —
- Agent: implementer — Phase: 1

### Step 2 — Schema: `pr_url` column + unique index on repo, generate migration  (package: server)
- Covers: AC12, AC13, AC16 (DB guarantee of one row per repo, so one per (agent, repo))
- Files: `server/src/db/schema/ci.ts`; `NEW server/src/db/migrations/0017_*.sql` + `meta/0017_snapshot.json` + `meta/_journal.json` entry (all written by drizzle-kit)
- Context: `ciInstallations` at `server/src/db/schema/ci.ts:4-12` (no table callback today). Pattern for an index callback: `server/src/db/schema/repos.ts:22` — `uq: uniqueIndex('repos_ws_fullname_uq').on(t.workspaceId, t.fullName)`. Latest migration is `0016_grey_vin_gonzales.sql`. No module or seed writes `ci_installations` today (only `schema/ci.ts`, `schema.ts`, contracts reference it), so the unique index cannot hit existing duplicates.
- Change: add `prUrl: text('pr_url')` (nullable); add a third `pgTable` arg `(t) => ({ repoUq: uniqueIndex('ci_installations_repo_uq').on(t.repo) })`. Then from `server/`: `./node_modules/.bin/drizzle-kit generate`. Do not edit the generated files.
- Skills: `drizzle-orm-patterns`, `postgresql-table-design` — generated migrations only; `_uq` suffix.
- Done when: one new migration adds `pr_url` and `ci_installations_repo_uq`; `tsc --noEmit` passes.
- Depends on: —
- Agent: implementer — Phase: 1

### Step 3 — Pure generation: slugs, manifest, workflow, file list, domain errors  (package: server)
- Covers: AC6 (file set), AC7, AC8, AC9, AC16/AC17/AC14 (error classes), AC18; EC2, EC3, EC4, EC18; NFR2, NFR3, NFR4
- Files: `NEW server/src/modules/ci/domain.ts`, `NEW server/src/modules/ci/manifest.ts`, `NEW server/src/modules/ci/workflow.ts`, `NEW server/src/modules/ci/constants.ts`
- Context:
  - Error pattern to copy: `server/src/modules/eval/domain.ts:21-67` (`class X extends AppError { constructor(message = '...') { super('code', message, status); } }`); `AppError(code, message, statusCode, details?)` at `server/src/platform/errors.ts:7-17`.
  - Slug pattern to adapt (no path split): `caseNameFor` at `server/src/modules/eval/domain.ts:91-97`.
  - `AgentManifest` fields (`name, provider, model, system_prompt, skills, strategy, ci_fail_on`) at `server/src/vendor/shared/contracts/eval-ci.ts:152-168`; `import type` only in domain.
  - Runner file names it reads: one `*.yaml` in `.devdigest/agents/` (`agent-runner/src/manifest.ts:36-45`), skills at `.devdigest/skills/<slug>.md` (`agent-runner/src/skills.ts:17-18`), env table `agent-runner/README.md:89-100`, fork skip expected from the workflow (`agent-runner/src/context.ts:30-32`).
  - The runner's comments name `server/src/modules/ci/manifest.ts` and `workflow.ts` (`agent-runner/src/manifest.ts:10`, `agent-runner/src/context.ts:9`); match those names.
- Change:
  - `constants.ts`: `CI_PATHS` (`.devdigest/agents/`, `.devdigest/skills/`, `.devdigest/runner/index.js`, `.github/workflows/devdigest-review.yml`), `CI_BRANCH_PREFIX = 'devdigest/ci-'`, `CI_PR_TITLE = 'Add DevDigest CI review'`, `CI_COMMIT_MESSAGE`, `CI_TRIGGERS = ['opened','synchronize','reopened'] as const`, `CI_POST_AS = ['github_review','pr_comment','none'] as const`, `CI_EXPORT_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const`, `SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/`, `SAFE_PATH_ROOTS = ['.devdigest/', '.github/workflows/']`.
  - `domain.ts`:
    - errors: `CiRepoHasOtherAgentError` (409 `ci_repo_has_other_agent`, message names the other agent, `details: { agent_name }`), `CiProviderUnsupportedError` (422 `ci_provider_unsupported`), `CiRateLimitedError` (429 `rate_limited`).
    - `toSlug(text: string): string` — lowercase, non-`[a-z0-9]` runs → `-`, trim dashes; no `/` splitting.
    - `requireSlug(text, what): string` — throws `ValidationError` (422) when the result fails `SLUG_RE` (empty included).
    - `skillSlugs(skills: {name}[]): string[]` — throws `ValidationError` naming both skills on a collision (EC18).
    - `assertSafePath(path)` — under `SAFE_PATH_ROOTS`, no `..`, not starting with `/` (NFR4).
    - `buildCiFiles(input: { agent: CiAgent; bundle: string; triggers: CiTrigger[]; postAs: CiPostAs }): CiFile[]` — order: manifest, skills, runner, workflow; `editable: false`; every path through `assertSafePath`.
  - `manifest.ts`: `renderManifest(agent, skillSlugs): string` = `JSON.stringify({ name, provider, model, system_prompt, skills, strategy, ci_fail_on }, null, 2) + '\n'`. Fields taken verbatim from the agent (AC7).
  - `workflow.ts`: `renderWorkflow({ triggers, postAs }): string` — fixed YAML template; only values from `CI_TRIGGERS` / `CI_POST_AS` are interpolated (the caller has already validated them). Shape:
    - `on.pull_request.types: [<triggers>]`
    - `permissions: { contents: read, pull-requests: write }`
    - workflow-level `env: { DEVDIGEST_POST_AS: <postAs>, PR_NUMBER: ${{ github.event.pull_request.number }} }`
    - one job `review`, `if: github.event.pull_request.head.repo.full_name == github.repository` (AC18), `runs-on: ubuntu-latest`
    - steps: `actions/checkout@v4` (`persist-credentials: false`), `actions/setup-node@v4` with `node-version: 20`, then a run step whose `env` has `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}` and `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, and `run: node .devdigest/runner/index.js` with no arguments.
    - Secrets appear only by name (NFR2).
  - Types `CiAgent { id; name; provider; model; systemPrompt; strategy; ciFailOn; skills: { name: string; body: string }[] }` live in `ports.ts` (Step 4); domain imports them as types.
- Skills: `onion-architecture` — Core ring, no I/O, no runtime zod; `security` — enumerated values only into YAML, safe slugs/paths.
- Done when: `tsc --noEmit` passes; `buildCiFiles` for an agent with 0 skills returns exactly 3 files (manifest, runner, workflow) and with N skills returns N+3.
- Depends on: Step 4 (types). Write Step 4 types first or in the same pass.
- Agent: implementer — Phase: 1

### Step 4 — Ports for the ci module  (package: server)
- Covers: prerequisite of Steps 5, 6, 7
- Files: `NEW server/src/modules/ci/ports.ts`
- Context: pattern `server/src/modules/eval/ports.ts:141-205` (repository port, agents port, log port). `GitHubClient` comes from `@devdigest/shared` (the adapter port; methods used: `commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }>`, `findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null>`, `openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }>`, see `server/src/adapters/github/octokit.ts:247,266,334`).
- Change: declare
  - `CiAgent` (Step 3);
  - `CiInstallationRecord { id; agentId; repo; targetType: CiTarget; installedAt: Date; prUrl: string | null }`;
  - `CiRepositoryPort`:
    - `getAgent(workspaceId, agentId): Promise<CiAgent | undefined>` — agent + linked skills in order;
    - `isRepoImported(workspaceId, fullName): Promise<boolean>`;
    - `listInstallations(agentId): Promise<CiInstallationRecord[]>` — newest first;
    - `findInstallationByRepo(repo): Promise<{ agentId: string; agentName: string } | undefined>`;
    - `upsertInstallation(v: { agentId; repo; targetType: 'gha'; prUrl: string }): Promise<CiInstallationRecord | undefined>` — `undefined` when the repo row belongs to another agent.
  - `CiGitHubPort = () => Promise<Pick<GitHubClient, 'commitFiles' | 'findOpenPr' | 'openPullRequest'>>`;
  - `RunnerBundlePort = () => Promise<string>` (throws `ConfigError` when missing);
  - `CiLogPort { info(obj: unknown, msg?: string): void }`.
- Skills: `onion-architecture` — no infrastructure types in port signatures.
- Done when: `tsc --noEmit` passes; `ports.ts` imports only `import type` from `@devdigest/shared`.
- Depends on: —
- Agent: implementer — Phase: 1

### Step 5 — `CiRepository` (Drizzle)  (package: server)
- Covers: AC2 (list), AC12/AC13 (upsert, one row), AC16 (owner lookup); EC16 (repo imported check)
- Files: `NEW server/src/modules/ci/repository.ts`
- Context:
  - Tables: `t.ciInstallations` (`server/src/db/schema/ci.ts:4`), `t.agents`, `t.agentSkills`, `t.skills` (`name`, `body`, `server/src/db/schema/skills.ts:10,16`), `t.repos` (`fullName`, `workspaceId`, unique `repos_ws_fullname_uq`, `server/src/db/schema/repos.ts:14,22`).
  - Linked-skills query to copy: `AgentsRepository.linkedSkills` at `server/src/modules/agents/repository.ts:204-212` (inner join, `orderBy(asc(t.agentSkills.order))`).
  - Agent lookup scoped by workspace: `server/src/modules/agents/repository.ts:65-71`.
  - Imports: `import type { Db } from '../../db/client.js'; import * as t from '../../db/schema.js';` (as in `agents/repository.ts:2-3`).
- Change: `class CiRepository implements CiRepositoryPort`, constructed with `Db`.
  - `upsertInstallation`: `insert … onConflictDoUpdate({ target: t.ciInstallations.repo, set: { prUrl, installedAt: new Date() }, where: eq(t.ciInstallations.agentId, agentId) }).returning()`. An empty result means another agent owns the repo, so return `undefined`.
  - `listInstallations` orders by `desc(installedAt)`.
  - Rows are mapped to `CiInstallationRecord` inside the repository.
- Skills: `onion-architecture`, `drizzle-orm-patterns` — map in the repository; no imports of `routes.ts` or `service.ts`.
- Done when: `tsc --noEmit` passes; the onion gate reports no new violations.
- Depends on: Steps 2, 4
- Agent: implementer — Phase: 1

### Step 6 — `CiService`: list + export orchestration  (package: server)
- Covers: AC2, AC6, AC12, AC13, AC14, AC16, AC17; EC5–EC9, EC13, EC14, EC17, EC19; NFR2, NFR5, NFR8
- Files: `NEW server/src/modules/ci/service.ts`
- Context:
  - Service pattern (constructor deps object): `EvalService` wiring at `server/src/platform/container.ts:325-348`.
  - Errors: `NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError` at `server/src/platform/errors.ts:19-41`.
  - Retryable/timeout shapes: `TimeoutError` (`server/src/platform/resilience.ts:6`); Octokit errors carry `.status` (`resilience.ts:36-40`). The global handler maps `AppError` to its status and anything else to `statusCode ?? 500` (`server/src/app.ts:139-184`), so GitHub errors must be mapped here.
  - `container.github()` throws `ConfigError('GITHUB_TOKEN is not configured')` (`server/src/platform/container.ts:416-423`).
- Change: `class CiService` with deps `{ repo: CiRepositoryPort; github: CiGitHubPort; readRunnerBundle: RunnerBundlePort }`.
  - `listInstallations(ws, agentId)`: throws `NotFoundError` when the agent is unknown; otherwise returns the records.
  - `exportCi(ws, agentId, input: { repo; action; postAs; triggers; base }, { logger })`. Order (each guard runs before any GitHub call):
    1. Agent exists, else 404.
    2. `provider === 'openrouter'`, else `CiProviderUnsupportedError`.
    3. `isRepoImported`, else 404.
    4. `findInstallationByRepo` owned by another agent, then `CiRepoHasOtherAgentError`.
    5. `readRunnerBundle()` (may throw `ConfigError`).
    6. `requireSlug(agent.name)` + `buildCiFiles`.
    7. `action === 'files'`: return a transient installation `{ id: '', agent_id, repo, target_type: 'gha', installed_at: now ISO, pr_url: null }`, the files and `pr_url: null`. No DB write, no `github()` call.
    8. `open_pr`:
       - `const gh = await github()` (`ConfigError` when there is no token);
       - `commitFiles(repoRef, { branch: 'devdigest/ci-<slug>', base, message, files })`;
       - `findOpenPr(repoRef, branch)` ?? `openPullRequest(repoRef, { title: CI_PR_TITLE, head: branch, base, body })`;
       - **then** `upsertInstallation({ …, prUrl })`; `undefined` → `CiRepoHasOtherAgentError` (lost race);
       - return `{ installation, files, pr_url }`.
  - GitHub error mapping (wrap steps of 8 only):
    - `AppError` is rethrown;
    - `status === 429` → `CiRateLimitedError`;
    - `TimeoutError` or any other error → `ExternalServiceError` with a short single-line message such as `GitHub request failed (403)`. No raw payload and no token.
  - Log exactly one `logger.info({ agent_id, repo, action, outcome }, 'ci export')` per call, success or error. `outcome` is `'ok'` or the error `code`. Never log contents, file text or tokens.
  - Map records to the wire `CiInstallation` (snake_case, ISO date, `pr_url`) in the service, or in a small `toWire` in `domain.ts`.
- Skills: `onion-architecture` (no `Container`, no drizzle, no adapters; `AppError` taxonomy), `security` (A09 logging, A01 repo allowlist).
- Done when: `tsc --noEmit` passes. A failure in `commitFiles`, `findOpenPr` or `openPullRequest` leaves `upsertInstallation` uncalled (by code reading).
- Depends on: Steps 3, 4
- Agent: implementer — Phase: 1

### Step 7 — Routes, runner-bundle adapter, container wiring, module registration  (package: server)
- Covers: AC2, AC6, AC10 (server 422 on empty triggers), AC12, AC14, AC16, AC17; NFR1; EC16
- Files: `NEW server/src/modules/ci/routes.ts`, `NEW server/src/adapters/runner-bundle/local.ts`, `server/src/platform/container.ts`, `server/src/modules/index.ts`
- Context:
  - Route pattern to copy: `server/src/modules/eval/routes.ts:35-102` (`appBase.withTypeProvider<ZodTypeProvider>()`, `getContext(container, req)`, `IdParams` from `../_shared/schemas.js`, `config: { rateLimit: … }`, `logger: req.log`).
  - `CiExportInput` at `server/src/vendor/shared/contracts/eval-ci.ts:174-182` is loose (`target` accepts circle/jenkins/cli, `triggers: z.array(z.string())`, free `base`). The spec forbids shared changes beyond `pr_url`, so tighten in the route.
  - Registration: `server/src/modules/index.ts:19,52` (`import evalPipeline from './eval/routes.js'` + entry).
  - Container getter pattern: `server/src/platform/container.ts:135,325-348`; `github()` at `:416`.
- Change:
  - `routes.ts` (default export `async function ciRoutes`):
    - The body schema is a route-local `CiExportInput.extend(...)`:
      - `repo` matches `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`;
      - `target: z.literal('gha').default('gha')`;
      - `triggers: z.array(z.enum(CI_TRIGGERS)).min(1).default([...CI_TRIGGERS])`, deduplicated;
      - `base` is branch-safe (`^[A-Za-z0-9._/-]+$`, no `..`, no leading `/` or `-`) and defaults to `'main'`.
      - Invalid input yields 422 `validation_error` through the global handler.
    - `POST /agents/:id/export-ci`: `{ params: IdParams, body, response: { 200: CiExport } }`, `config: { rateLimit: CI_EXPORT_RATE_LIMIT }`; calls `container.ciService.exportCi(...)`.
    - `GET /agents/:id/ci-installations`: `response: { 200: z.array(CiInstallation) }`.
  - `adapters/runner-bundle/local.ts`: `readLocalRunnerBundle(): Promise<string>` reads `<repo root>/agent-runner/dist/index.js`, resolved from `import.meta.url` (`../../../../agent-runner/dist/index.js`). On ENOENT it throws `ConfigError('Runner bundle not found at agent-runner/dist/index.js — build it: cd agent-runner && pnpm build')`.
  - `container.ts`: memoized `get ciService()` → `new CiService({ repo: new CiRepository(this.db), github: () => this.github(), readRunnerBundle: readLocalRunnerBundle })`.
  - `modules/index.ts`: `import ci from './ci/routes.js'` + `ci,` entry.
- Skills: `onion-architecture` (routes call the service only; concrete classes are built only in the container), `fastify-best-practices`, `zod` (parse at the boundary), `security` (rate limit, enum allowlist, branch-safe `base`).
- Done when:
  - `./node_modules/.bin/tsc --noEmit` passes in `server/`;
  - the onion gate (`.claude/skills/onion-architecture/scripts/check.sh`) reports zero new violations;
  - `.claude/scripts/check-changed.sh server` passes;
  - the existing hermetic suite is green.
- Depends on: Steps 1–6
- Agent: implementer — Phase: 1

### Step 8 — Client data hooks for CI  (package: client)
- Covers: AC2, AC6, AC12, AC14, AC15 (prerequisite of Steps 10–11)
- Files: `NEW client/src/lib/hooks/ci.ts`, `client/src/lib/hooks/index.ts`
- Context:
  - Pattern: `client/src/lib/hooks/eval.ts:19-25` (`useQuery({ queryKey: ["eval-cases", agentId], queryFn: () => api.get<…>(…), enabled: !!agentId })`) and the mutation in the same file.
  - `ApiError { status; code? }` at `client/src/lib/api.ts:8-17`.
  - Note: the global `MutationCache.onError` toasts every mutation error (`client/src/lib/providers.tsx:41-43`); the inline step-4 error comes in addition to it (§6).
- Change:
  - `useCiInstallations(agentId)` → `GET /agents/${agentId}/ci-installations`, key `["ci-installations", agentId]`.
  - `useExportCi(agentId)` → mutation `POST /agents/${agentId}/export-ci` with a `CiExportInputBody`; returns `CiExport`. `onSuccess`: when `action === "open_pr"`, invalidate `["ci-installations", agentId]`.
  - Use type-only imports from `@devdigest/shared`.
  - Re-export both from `lib/hooks/index.ts`.
- Skills: `frontend-ui-architecture` (data hooks in `lib/hooks`), `react-best-practices`.
- Done when: client `tsc --noEmit` passes.
- Depends on: Step 1
- Agent: implementer — Phase: 2

### Step 9 — i18n keys in the `ci` namespace  (package: client)
- Covers: NFR7; prerequisite of Steps 10–11 (AC1, AC12, AC14, AC16, AC17 text)
- Files: `client/messages/en/ci.json`
- Context: the existing `ci.json` has `runs`, `exportWizard`, `ciTab`, `publishDialog`, `page` (`client/messages/en/ci.json:1-106`). The spec's observables cite `ci.tab.empty.*`, `ci.wizard.install.secretHint`, `ci.wizard.install.error.*`, `ci.wizard.target.repoTaken`, `ci.wizard.target.providerUnsupported`. `agents.editor.tabs.ci` already exists (`client/messages/en/agents.json:55`), so no `agents.json` change is needed.
- Change: add two new top-level sections and leave the old ones untouched.
  - `tab`: `title`, `activeIn` (`"Active in {count} repos"`), `empty.title`, `empty.body`, `addToCi`, `ghaChip`, `prOpened`, `failOn.label`, `failOn.critical`, `failOn.warning`, `failOn.never`, `loadError`.
  - `wizard`:
    - top-level: `title`, `close`, `back`, `continue`, `install`, `installing`;
    - `steps.{target,preview,configure,install}`;
    - `target.{gha,circle,jenkins,cli,comingSoon,repoLabel,repoPlaceholder,repoTaken,providerUnsupported}` — `repoTaken` takes `{agent}`;
    - `preview.{publicWarning,bundleSize,copy,copied,loading}` — `bundleSize` takes `{size}`;
    - `configure.{triggersLabel,triggers.{opened,synchronize,reopened},postAsLabel,postAs.{githubReview,prComment,none}}`;
    - `install.{cardTitle,cardBody,secretHint,prLink,error.{config,external,rateLimited,generic}}` — `secretHint` names `OPENROUTER_API_KEY`.
- Skills: `frontend-ui-architecture` — camelCase keys nested by surface.
- Done when: the JSON is valid and every key used in Steps 10–11 exists.
- Depends on: —
- Agent: implementer — Phase: 2

### Step 10 — CI tab: installations, badge, "Fail CI on", empty state; register tab  (package: client)
- Covers: AC1, AC2, AC3; EC1, EC10, EC12; NFR6 (segmented control), NFR7
- Files:
  - `NEW client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/CiTab.tsx`
  - `NEW …/CiTab/index.ts` (named + default, as siblings)
  - `NEW …/CiTab/styles.ts`
  - `NEW …/CiTab/constants.ts`
  - `NEW …/CiTab/helpers.ts`
  - `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`
  - `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`
- Context:
  - Tab registry: `TABS` at `AgentEditor/constants.ts:11-17`; `TAB_VIEWS` at `AgentEditor/AgentEditor.tsx:19-24` (`React.ComponentType<{ agent: Agent }>`). Icon `"Workflow"` exists (`client/src/vendor/ui/icons.tsx:79`).
  - Sibling pattern with its own `styles.ts` / `constants.ts` / `helpers.ts` and nested `_components/`: `AgentEditor/_components/EvalsTab/` (copy this shape).
  - Agent update: `useUpdateAgent()` → `mutate({ id, patch })` (`client/src/lib/hooks/agents.ts:61-70`); `ConfigTab` sends `ci_fail_on` the same way (`ConfigTab.tsx:53-68`).
  - Vendor primitives `Badge`, `Chip`, `EmptyState`, `Button` from `@devdigest/ui`.
  - Relative time: use next-intl `useFormatter().relativeTime(date)`. Do not import `app/repos/[repoId]/pulls/helpers.ts` (that is a cross-feature import).
- Change:
  - Add `{ key: "ci", labelKey: "editor.tabs.ci", icon: "Workflow" }` to `TABS` and `ci: CiTab` to `TAB_VIEWS`.
  - `CiTab({ agent })` uses `useCiInstallations(agent.id)`:
    - header: title, `Badge` with `t("tab.activeIn", { count })` when there are rows, and an "Add to CI" button that opens the wizard (`open` state);
    - no rows: `EmptyState` with the `tab.empty.*` text and an enabled "Add to CI" button;
    - rows (`data-ci-installation`):
      - repo `owner/name`, truncated with `title` = full name;
      - "GitHub Actions" chip;
      - "PR opened" link whose `href` is `pr_url`, rendered only when `isGithubPrUrl(pr_url)` (`https://github.com/` prefix), with `target="_blank" rel="noopener noreferrer"`;
      - relative `installed_at`.
    - "Fail CI on" control: `role="radiogroup"` with three `role="radio"` buttons and `aria-checked`, keyboard-operable (Arrow keys or Tab plus Enter/Space) with visible focus. Clicking a segment calls `useUpdateAgent().mutate({ id, patch: { ci_fail_on } })`. The selected segment is derived from `agent.ci_fail_on`, so `any` selects none.
  - `helpers.ts` (pure): `selectedFailOnSegment(ciFailOn) → "critical" | "warning" | "never" | null`, `isGithubPrUrl(url)`, `formatBytes(n)`, `exportErrorKey(err) → i18n key`.
  - `constants.ts`: `FAIL_ON_SEGMENTS`, `CI_TARGETS` (gha enabled + circle/jenkins/cli disabled), `CI_TRIGGERS`, `CI_POST_AS`, `WIZARD_STEPS`.
- Skills: `frontend-ui-architecture` (folder anatomy, domain rules in `helpers.ts`, derive instead of store), `react-best-practices`, `security` (`pr_url` link allowlist, text rendering).
- Done when: client `tsc --noEmit` passes; `vitest related` on the touched files is green (existing `AgentEditor.test.tsx` still passes).
- Depends on: Steps 8, 9
- Agent: implementer — Phase: 2

### Step 11 — Export wizard with own dialog shell  (package: client)
- Covers: AC4, AC5, AC6 (preview UI), AC10, AC11, AC12 (step 4), AC14 (inline error), AC15, AC16 (step 1 message), AC17 (step 1 message); EC15, EC21; NFR6, NFR7
- Files: `NEW …/CiTab/_components/WizardDialog/{WizardDialog.tsx,index.ts}`, `NEW …/CiTab/_components/ExportWizard/{ExportWizard.tsx,index.ts}`, `NEW …/CiTab/_components/TargetStep/{TargetStep.tsx,index.ts}`, `NEW …/CiTab/_components/PreviewStep/{PreviewStep.tsx,index.ts}`, `NEW …/CiTab/_components/ConfigureStep/{ConfigureStep.tsx,index.ts}`, `NEW …/CiTab/_components/InstallStep/{InstallStep.tsx,index.ts}` (all under `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/`); `CiTab.tsx` (mount the wizard)
- Context:
  - Step indicator: `ExportWizardSteps({ step, labels })` from `@devdigest/ui` (`client/src/vendor/ui/ExportWizardSteps.tsx:6`). Use it as-is and add `aria-current="step"` on our own visually-hidden current-step label, since the vendor file cannot change.
  - Repo list: `useRepos()` → `Repo[]` with `full_name` (`client/src/lib/hooks/core.ts:65-70`, `client/src/vendor/shared/contracts/platform.ts:146`).
  - `ApiError.code` / `.message` for 409/422/500/502/429 (`client/src/lib/api.ts:8-17`).
  - Visual reference only (do not import or edit): `client/src/vendor/ui/kit/Modal.tsx` layout.
- Change:
  - `WizardDialog({ titleId, onClose, children, footer })`:
    - overlay plus a `role="dialog"` box with `aria-modal="true"` and `aria-labelledby={titleId}`;
    - on mount, focus the first focusable element; Tab/Shift+Tab wrap inside the dialog; Escape calls `onClose`;
    - focus returns to the "Add to CI" button on close.
  - `ExportWizard({ agent, onClose })` owns the wizard state: `step` 0–3, `repo`, `triggers` (all three by default), `postAs` (`github_review`), and one `useExportCi(agent.id)` per action.
    - Step 1 `TargetStep`:
      - four cards; GitHub Actions is selected; CircleCI, Jenkins and Generic CLI have `aria-disabled="true"`, a "Coming soon" label, and a click handler that does nothing (AC4);
      - repo `SelectInput` whose options are the imported repos only (AC5);
      - Continue is disabled until a repo is chosen.
      - On Continue: call `export-ci` with `action: "files"`.
        - 409 `ci_repo_has_other_agent`: show `wizard.target.repoTaken` with the agent name from `details.agent_name` (or the message), stay on step 1, keep Continue disabled for that repo (AC16).
        - 422 `ci_provider_unsupported`: show `wizard.target.providerUnsupported` (AC17).
        - Success: go to step 2.
      - If the agent's provider is not `openrouter`, show `providerUnsupported` up front as well (derived from `agent.provider`).
    - Step 2 `PreviewStep`:
      - the `wizard.preview.publicWarning` banner;
      - per file: path, then contents in a read-only `<pre>`; for `.devdigest/runner/index.js` only the size (`formatBytes`);
      - a Copy button per file → `navigator.clipboard.writeText(contents)`, then "Copied" in a `role="status"` `aria-live="polite"` region (AC11, `data-ci-file` hook).
    - Step 3 `ConfigureStep`:
      - trigger chips as `role="checkbox"` buttons;
      - `postAs` as a `role="radiogroup"`;
      - Continue is disabled when no trigger is selected, so no call is made (AC10).
    - Step 4 `InstallStep`:
      - the card "Open a PR with these files";
      - the `wizard.install.secretHint` text, always visible (AC12, EC21);
      - Install calls `export-ci` with `action: "open_pr"` plus `repo`, `triggers` and `post_as`. While pending, Install and Back are `disabled`, Install has `aria-busy="true"`, and the click handler returns early when `isPending`, so one request goes out (AC15).
      - On success, show the PR link (`isGithubPrUrl` guard) in a `role="status"` region.
      - On error, show `wizard.install.error.<config|external|rateLimited|generic>` inline in `role="alert"`. Keep step 4 open and the inputs as they were (AC14).
  - Strings come from the `ci` namespace only. Test hooks are `data-ci-*` attributes.
- Skills: `frontend-ui-architecture` (nested children are `Name.tsx` + named-only `index.ts` and share the CiTab `styles` / `constants` / `helpers`; wizard state lives in `ExportWizard`, steps are presentational), `react-best-practices` (no effects for derived state; the focus-trap effect is the one legitimate DOM sync), `security` (text-only rendering of GitHub messages, https-github-only links).
- Done when:
  - client `tsc --noEmit` passes and `.claude/scripts/check-changed.sh client` is green;
  - by code reading, every AC4–AC17 client observable has its attribute or role: `aria-disabled`, `disabled`, `aria-busy`, `role="status"`, `role="alert"`, `aria-labelledby`, `aria-current="step"`.
- Depends on: Steps 8, 9, 10
- Agent: implementer — Phase: 2

### Step 12 — Phase-end verification  (package: server, client, agent-runner sanity)
- Covers: NFR9; all ACs (regression only)
- Files: none
- Context: commands in §5.
- Change: none. Run `.claude/scripts/check-changed.sh server --full` at the end of Phase 1 and `.claude/scripts/check-changed.sh client --full` at the end of Phase 2. `agent-runner` is unchanged, so its typecheck is optional: it needs its deps, and `agent-runner` uses a pnpm lockfile.
- Skills: —
- Done when: both `--full` runs are green; the onion gate shows no new violations.
- Depends on: Steps 1–11
- Agent: implementer (end of each phase) — Phase: 1 and 2

## 5. Test plan
**Follow-up only in this run.** The user turned tests off: the implementer writes no tests and `test-writer` is not spawned. The items below are listed so a later run (`/run-plan export-to-ci --with-tests`, or a manual `test-writer` run) can pick them up. `plan-verifier` must treat them as "not in scope (follow-up)", not as "not met".

- Existing suites to run:
  - after each step: `.claude/scripts/check-changed.sh server` / `client`;
  - at the end of each phase: `--full`;
  - optional `--it` (Docker) for regression: `server/test/eval.it.test.ts` etc. Known flaky: `reviews.it.test.ts`, `conventions-rescan-preserves-decisions.it.test.ts`.
- Tests to add later:
  - `NEW server/test/ci-domain.test.ts` — hermetic — AC7, AC8, AC9, AC18, NFR2, NFR3, NFR4, EC2, EC3, EC4, EC18 — asserts:
    - the manifest `JSON.parse`s and round-trips into `AgentManifest` with the agent's fields, including a prompt containing quotes, `:`, `#`, `---` and newlines;
    - the workflow text has the selected `types`, `permissions`, `node-version: 20`, the `env` keys, the `run` line without arguments, the fork `if:`, and `DEVDIGEST_POST_AS` equal to `post_as`;
    - slugs match `SLUG_RE`, an empty slug or a collision throws 422, and `..` / `/` names are reduced to safe slugs;
    - every path sits under the allowed roots;
    - no secret value appears in any file.
  - `NEW server/test/ci-service.test.ts` — hermetic, with an in-memory fake `CiRepositoryPort` and `MockGitHubClient` (`server/src/adapters/mocks.ts:130,218-231`) — AC6, AC14, AC16, AC17, NFR5, NFR8, EC14 — asserts:
    - `files` makes no github and no upsert call;
    - missing token → `config_error`; a GitHub 429 → `rate_limited`; a 403 or timeout → `external_service_error`;
    - a failure after the commit leaves no upsert;
    - a missing bundle → `config_error` naming the path;
    - a non-openrouter agent → 422 before any call;
    - another agent's repo → 409 with no github call;
    - exactly one info log line without contents.
  - `NEW server/test/ci.it.test.ts` — it (Docker, imports `test/helpers/pg.ts`) — AC2, AC6, AC10, AC12, AC13, AC16, EC16 — asserts:
    - GET is empty, then returns 1 row with `pr_url`, newest first, and 404 for an unknown agent;
    - `files` leaves the row count unchanged;
    - `open_pr` returns a non-null `pr_url` and exactly one row;
    - a second install returns the same `pr_url` and the row count stays 1;
    - another agent on the same repo → 409;
    - a repo that is not imported → 404;
    - `triggers: []` and `target: "circle"` → 422.
  - `NEW client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/CiTab.test.tsx` — client — AC1, AC2, AC3, AC4, AC5, AC6 (warning + bundle size), AC10, AC11, AC12 (secret hint + link), AC14, AC15, AC16, AC17, NFR6 — `vi.mock` the `lib/hooks` CI hooks and `useRepos`; use `fireEvent`, not user-event.
  - `NEW …/CiTab/helpers.test.ts` — client — AC3, AC2 — `selectedFailOnSegment` (with `any` → null) and `isGithubPrUrl`.
- Needs Docker: only for the follow-up `ci.it.test.ts` and optional `--it` regression.

## 6. Risks and open questions
- **SPEC-08 merges first and may add migration `0017_*`.** Rebasing would then collide on the number. Mitigation: after the rebase, delete this branch's generated migration and run `drizzle-kit generate` again. Never renumber by hand. Owner: the orchestrator at rebase time.
- **Duplicate error feedback.** The global `MutationCache.onError` toasts every failed mutation (`client/src/lib/providers.tsx:41-43`), so an Install error shows inline (as AC14 requires) and as a toast. Accepted as-is for "simplest"; changing `providers.tsx` is out of scope. User decides later.
- **The unique index on `repo` is global, not per workspace.** That matches "one agent per GitHub repo", because one manifest per repo is the runner's rule. The tool is local-first and single-workspace, so the impact is nil today. Note for the reviewers.
- **Runner bundle path.** It is resolved from the adapter's `import.meta.url`. That works under tsx and vitest; under the server `pnpm build` output layout it is unverified (§7). If the build moves files, the export returns `config_error` naming the path. That is visible, not silent.
- **The runner bundle is not built in this checkout** (no `agent-runner/dist/`), and `agent-runner` uses pnpm, which is broken here. Manual end-to-end needs `cd agent-runner && ./node_modules/.bin/ncc build src/index.ts -o dist` after its deps are installed. Automated checks do not need it.
- **Nested-folder convention conflict.** `frontend-ui-architecture/references/this-repo.md:91-96` says nested `_components/` children have no own `styles.ts`, but the existing siblings under `AgentEditor/_components/` (ConfigTab, EvalsTab, StatsTab, SkillsTab) each have one. The plan follows the siblings for `CiTab` and the skill rule for CiTab's own children. The architecture reviewer may note it; it is not a blocker.
- **GitHub 403 secondary rate limits are mapped to 502, not 429.** This is the minimal mapping and can be refined later.
- **The install PR itself triggers the workflow.** It fails until the secret is added; this is EC21, warned in step 4. Expected behaviour.

## 7. Not verified
- That the server's production build (`pnpm build`) keeps `server/src/adapters/runner-bundle/local.ts` at a depth where `../../../../agent-runner/dist/index.js` resolves. Not checked: no build was run, and Bash is not available to the planner.
- That `onConflictDoUpdate(... where ...)` returns an empty array for a non-matching conflict under this Drizzle version. Postgres semantics say yes, but the Drizzle version was not checked against the docs. If it does not hold, the fallback is a pre-check (already in the service order) plus a catch on the unique violation.
- Whether `SelectInput` from `@devdigest/ui` accepts `{ value, label }` options and a placeholder. It is used that way in `ConfigTab.tsx:117-121` with `{value,label}` options; the placeholder was not checked.
- The exact `GitHubClient` port declaration in `server/src/vendor/shared/adapters.ts`. The method signatures were taken from the implementing class `octokit.ts:247,266,334` and the mock `mocks.ts:218-231`.
- Whether drizzle-kit will name the new migration `0017_<random>`. Inferred from the existing sequence.

## 8. Execution mode
- **Mode:** multi-agent. Chosen by the user.
- **User caps (binding):**
  - at most **5 spawned implementer runs in total** (phases + fixes);
  - **no test-writer**; the implementer writes no tests, and §5 is a follow-up;
  - fix loop: **at most 2 iterations** and **at most 2 subagents** spawned for it in total.

### Phases (2 implementer runs; this leaves 3 under the cap, 2 of them reserved for the fix loop)
- Phase 1 — server + both `shared` contract copies — Steps 1, 2, 4, 3, 5, 6, 7, 12 (in that order; Step 4's types come before Step 3) — check: `.claude/scripts/check-changed.sh server` per step, `.claude/scripts/check-changed.sh server --full` at the end, plus client `tsc --noEmit` for the Step 1 client copy.
- Phase 2 — client — Steps 8, 9, 10, 11, 12 — check: `.claude/scripts/check-changed.sh client` per step, `.claude/scripts/check-changed.sh client --full` at the end.

The phases run one after another (one writer per working tree; no worktree isolation needed). The orchestrator stays at the repo root when spawning (`INSIGHTS.md` path-guard entry).

### Agent budget

| Slot | Agent | Counts toward the 5-implementer cap |
|---|---|---|
| 1 | implementer Phase 1 | yes |
| 2 | implementer Phase 2 | yes |
| 3 | fix loop iteration 1 (implementer, or the main session for one-line fixes) | yes if spawned (fix-loop cap 1/2) |
| 4 | fix loop iteration 2 | yes if spawned (fix-loop cap 2/2) |
| 5 | spare: only for a `plan-verifier` (code) "not met" gap before reviews | yes |

Read-only reviewers and verifiers are not implementers. They are listed as options below.

### Review and verification options (cost/benefit; my recommendation)

| Option | When | Cost | Benefit | Recommendation |
|---|---|---|---|---|
| `plan-verifier` scope `code` | after Phase 2, before reviews | low (sonnet, mechanical, reads plan + bundle) | catches missing steps/AC observables while the fix is cheap; feeds the spare slot | **Run** |
| `architecture-reviewer` | after `plan-verifier` (code) is COMPLETE, on the review bundle (`PR_SELF_REVIEW_BASE=<base_sha> node .claude/skills/pr-self-review/scripts/bundle.mjs write`) | medium (sonnet, bundle-based) | new server module (onion: ports, container wiring, no route→db), new client folders, `shared` drift, migration; independent onion gate | **Run** |
| `security-reviewer` | same time as architecture (read-only, may run **in parallel** with it) | medium (sonnet) | this change writes user text into files pushed to a possibly public repo, builds file paths/branch names from names, generates a workflow that holds secrets, and renders GitHub text/URLs; NFR2–NFR4, AC18 are security ACs with no tests in this run | **Recommended (optional per user)**. If you skip one, skip this only after reading Step 3/6/7 yourself, because no tests back these ACs in this run. |
| `plan-verifier` scope `final` | after the fix loop | low | re-checks only items whose files changed in fixes + AC code evidence; §5 items reported as "follow-up" | **Run** (cheap closure gate) |
| `doc-writer` | after final verification | low–medium | `server/docs` or `docs/` page for the export flow; sets the spec to `implemented` | Optional. It is a writer, so it runs alone; recommended only once the follow-up tests exist. |
| `/pr-self-review` | before any PR | — | required repo gate | **Always required** before a PR |

### Fix loop (bounded)
- Input: the CRITICAL and HIGH findings from the reviewers. The user decides on MEDIUM findings; LOW findings are only logged.
- **Iteration 1:** one implementer run with the combined findings list (fix-loop subagent 1/2). One-line fixes may be made in the main session instead, which spawns nothing.
- Re-review only the touched files, with the reviewer(s) that raised the findings. Reviewers are read-only and do not count as fix-loop writers.
- **Iteration 2:** only if CRITICAL or HIGH findings remain (fix-loop subagent 2/2).
- Stop after iteration 2. Anything left goes to the user with the finding list. No third iteration, no extra spawns.

### Hand-off order
1. implementer Phase 1 (input: this plan + "Phase 1") → Implementation Report.
2. implementer Phase 2 (input: this plan + "Phase 2") → Implementation Report.
3. `plan-verifier` scope `code` (input: plan path, both reports). A not-met item uses the spare slot (one implementer run) or the main session.
4. Build the review bundle, then run `architecture-reviewer` and `security-reviewer` in parallel (both read-only).
5. Fix loop (at most 2 iterations, at most 2 spawned subagents).
6. `plan-verifier` scope `final`, with §5 marked follow-up.
7. Optional `doc-writer`; `/engineering-insights`; `/pr-self-review` before the PR (ask the user before any commit, push or PR).
