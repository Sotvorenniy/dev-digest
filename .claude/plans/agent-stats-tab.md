# Implementation Plan: Agent editor Stats tab (SPEC-05)

## 0. Spec readiness
- Source: `specs/2026-10-18-agent-stats-tab.md`, SPEC-05, Status `approved`. User approved D1-D14 as written, kept it as one spec (OQ2), deferred OQ3: the memory panel ships with its empty state.
- Spec readiness: ready ACs AC1-AC22. Blocked ACs: None. Self-check "For reviewers" items 1, 2, 3, 5, 8, 15 pass. There are no `[NEEDS CLARIFICATION]` markers, every AC has a "Verify by" lane, and no AC conflicts with the code read.
- Spec gaps routed to spec-creator (non-blocking):
  - EC4 vs AC13, Total runs card. EC4 says that with no run in the previous period "every delta [is] replaced by 'Not enough history to compare'". AC13's rule is "both compared values are non-null", and `previous_runs` is never null (it is 0). So on the runs card, AC13 shows "+N" while EC4 says it shows the replacement text. **Resolved 2026-10-19:** spec AC13 revised (EC4 wins): every delta, the runs delta included, needs `previous_runs > 0`. Blocks: none.
- Answered implementation questions: none were asked. Execution mode `multi-agent` was given by the coordinator. The planner chose the defaults below; none of them changes behaviour:
  - D-P1: the period picker and its period helpers/constants move from `app/agent-performance/.../AgentPerformanceView` to a shared `client/src/components/period-picker/`. A route may not import another route's `_components` (frontend-ui-architecture "Features do not import from each other"; client INSIGHTS "Update: skill → agent count…", where ImportSkillDrawer was moved for the same reason).
  - D-P2: the shared picker keeps reading its strings from the existing `agentPerformance.period.*` keys, so no key moves. Its error element id becomes `React.useId()` instead of the literal `agent-performance-period-error`.
  - D-P3: `formatPercent`, `formatDuration` and `SMALL_SAMPLE_THRESHOLD` move to a new `client/src/lib/agent-metrics.ts`, and `formatSignedCost` moves next to `formatCost` in `client/src/components/run-cost-badge/helpers.ts`. Each has a second consumer now (skill: "move it up only when a second, unrelated consumer actually appears").
  - D-P4: severity stacked bars are plain HTML/CSS bars, not recharts. There is no vendored stacked chart (spec code anchor `client/src/vendor/ui/charts/`), jsdom has no layout, and each bar needs a text alternative. The category donut copies the app-local recharts `PieChart` pattern of `CostDonut`, with an `aria-hidden` ring plus a text legend.
  - D-P5: the server reads only `trace #> '{prompt_assembly,skills_used}'` and `trace -> 'memory_pulled'` from `run_traces`, never the whole document (NFR4, NFR1). Shape checks happen in pure domain guards, not with runtime zod in the core (onion Decision 2).
  - D-P6: `runs_series` items use a local `z.object({ label: z.string(), value: z.number().int() })` in `observability.ts`, with the same shape as `PerfSeriesPoint`. `productionize.ts` imports `observability.ts` (`productionize.ts:3`), so importing back would create a module cycle.
  - D-P7: a memory trace counts as "with data" only when `memory_pulled` is an array whose every element is an object with a string `text`. Otherwise the whole run is "without data" (AC12). `pr` is used only when it is an integer, else null.
- Recommendations: D-P1 to D-P7 are in scope (they are *how*, not *what*). None needs the user.

## 1. Goal and scope
- Goal: add a fourth "Stats" tab to the agent editor. It shows one agent's KPIs with previous-period deltas, skill and memory usage, a severity time series and a category breakdown for a URL-held period. To support it, `GET /agents/:id/stats` is extended additively while keeping parity with the SPEC-04 dashboard.
- In scope:
  - Additive `AgentStats` fields in both `shared` copies.
  - Agent-performance domain, ports, repository and service changes.
  - Shared period picker extraction.
  - New `useAgentStats` hook.
  - New `agentStats` i18n namespace.
  - StatsTab and its children.
  - Tab registration.
  - Tests and docs.
- Out of scope: Evals and CI tabs or the "Sync CI" button (NG1, NG2); changing what traces record (NG3); the billed badge (NG5); repo filter, export or live refresh (NG6); any dashboard behaviour or response change (NG7); migrations.
- AC coverage:
  - AC1 — Steps 11, 8 — `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` (client)
  - AC2 — Steps 5, 7, 9 — `.../StatsTab/StatsTab.test.tsx`, `.../StatsTab/helpers.test.ts` (client)
  - AC3 — Steps 5, 9 — `StatsTab.test.tsx` (client)
  - AC4 — Step 5 — `StatsTab.test.tsx` (client)
  - AC5 — Steps 1, 2, 4 — `server/test/agent-performance-domain.test.ts` (hermetic), `server/test/agent-stats.it.test.ts` (it)
  - AC6 — Steps 2, 3, 4 — `agent-stats.it.test.ts` (it), `agent-performance-domain.test.ts` (hermetic)
  - AC7 — Steps 1, 2 — `agent-performance-domain.test.ts`, `agent-stats.it.test.ts`
  - AC8 — Steps 1, 2 — `agent-performance-domain.test.ts`, `agent-stats.it.test.ts`
  - AC9 — Steps 1, 2, 3 — `agent-performance-domain.test.ts`, `agent-stats.it.test.ts`
  - AC10 — Steps 1, 2, 3 — `agent-performance-domain.test.ts`, `agent-stats.it.test.ts`
  - AC11 — Steps 1, 2, 3 — `agent-performance-domain.test.ts`, `agent-stats.it.test.ts`, `server/test/contracts.test.ts` (hermetic, NFR4)
  - AC12 — Steps 2, 3 — `agent-performance-domain.test.ts`, `agent-stats.it.test.ts`
  - AC13 — Steps 6, 9, 10 — `StatsTab.test.tsx`, `StatsTab/helpers.test.ts` (client)
  - AC14 — Steps 6, 10 — `StatsTab.test.tsx` (client)
  - AC15 — Step 10 — `StatsTab.test.tsx` (client)
  - AC16 — Step 10 — `StatsTab.test.tsx` (client)
  - AC17 — Steps 9, 10 — `StatsTab.test.tsx`, `StatsTab/helpers.test.ts` (client)
  - AC18 — Steps 9, 10 — `StatsTab.test.tsx`, `StatsTab/helpers.test.ts` (client)
  - AC19 — Step 9 — `StatsTab.test.tsx` (client)
  - AC20 — Steps 7, 9 — `StatsTab.test.tsx` (client)
  - AC21 — Steps 2, 3, 9 — `StatsTab.test.tsx` (client), `agent-stats.it.test.ts` (`has_any_runs`)
  - AC22 — Steps 3, 4, 7 — `agent-stats.it.test.ts` (it: no write, no LLM), `StatsTab.test.tsx` (client: GET only)
  - NFR1 — Steps 3, 4 — NEW `server/test/agent-stats-perf.it.test.ts` (it)
  - NFR4 — Steps 1, 2 — `contracts.test.ts`, `agent-performance-domain.test.ts`
  - NFR7 — Step 1 — `contracts.test.ts` (existing block-parity test)
  - NFR8 — Step 4 — `server/test/agent-performance-service.test.ts`
  - NFR2, NFR5, NFR6 — Steps 8-11 — `StatsTab.test.tsx`, `AgentEditor.test.tsx`

## 2. Applicable constraints
- INSIGHTS entries:
  - Root `INSIGHTS.md` — "A contract field added to RunStats must be optional, not just nullable". Stored traces are old-schema JSON, so a missing `skills_used`/`memory_pulled` key is "no data", never a parse error (AC12). This is also why the domain must not parse a trace with the strict `RunTrace` zod schema.
  - Root — "The implementer cannot apply a plan-sanctioned vendor edit". Only the paired `*/src/vendor/shared/*` edit is allowed. No `client/src/vendor/ui` edit is planned.
  - Root — "Agent path-guard hooks resolve paths against the session cwd". Keep the main session at repo root before spawning writer agents.
  - Server `INSIGHTS.md` — "A finding reaches a run only through reviews.run_id, which has no FK". The category query must join findings → reviews → agent_runs exactly like `countFindingsByRun` (EC25).
  - Server — "Findings have no api/contract category". Free-text categories outside the five go to `other` (AC9, EC16).
  - Server — "Prompt logs are metadata-only; run_traces.trace still stores the full prompt". Never select or return the whole trace (NFR4).
  - Server — "PriceBook.estimate returns a different price on the first call after boot". Read-time re-pricing is unchanged. Parity tests must use one app instance and compare responses from the same process.
  - Server — "Run-driven IT tests flake…" and "`reviews.it.test.ts`… fail on a clean HEAD". Do not attribute those failures to this change.
  - Server — "dependency-cruiser's `--ignore-known` baseline is already stale". 8 known cycles; `check-changed.sh` already tolerates exactly those.
  - Server — "A per-route rateLimit never fires under NODE_ENV=test". No server 429 test is planned; 429 is a client-only lane (AC20).
  - Client `INSIGHTS.md` — "Formatting a cost at fixed 4dp reports cheap real runs as free". Use `formatCost` (three-way "—"/"$0.00"/"<$0.0001") (AC14, EC26).
  - Client — "Vendored Donut and MetricCard misreport small or rising costs". Do not use vendor `Donut`/`MetricCard`. Build app-local cards and donut; deltas carry a text sign (AC13, EC27).
  - Client — "Nested `_components/` drift". `StatsTab` under `AgentEditor/_components/` owns `styles.ts`/`constants.ts`/`helpers.ts` and a named+default `index.ts`, like `SkillsTab`. Its own nested children use `../../styles` and named-only `index.ts`.
  - Client — "`@testing-library/user-event` is not installed". Use `fireEvent` and `el.focus()`.
  - Client — "A th holding a labelled sort button…". Not applicable (no table).
- Architecture / AGENTS.md rules:
  - Onion: route → service → domain/ports ← repository. Routes need no change (the response schema is `AgentStats`). The service takes only `{ repo, estimateCost }` (`service.ts:13-16`). Domain stays pure, with no runtime zod.
  - Contract change edits both `server/src/vendor/shared/contracts/observability.ts` and `client/src/vendor/shared/contracts/observability.ts`. The "// Per-agent Stats" … "// Cross-session memory curator" block must stay byte-identical; `server/test/contracts.test.ts:479-484` asserts it.
  - Wire fields are snake_case. `.nullable()` is for always-present-but-null (`share`, `data_from`, previous averages); `.nullish()` only for `pr` (spec says nullish).
  - Client: `@devdigest/shared` is type-only (`client/AGENTS.md`). Import types via `@/lib/types` (`client/src/lib/types.ts:44` already re-exports `AgentStats`).
  - Client: `data-<thing>` hooks, strings in `client/messages/en/agentStats.json`, inline style objects with CSS variables only, `noUncheckedIndexedAccess` (`list[0]!`).
  - DB-touching server tests are `*.it.test.ts`.
  - pnpm is broken: use `./node_modules/.bin/<bin>`. Server typecheck needs `reviewer-core/node_modules` (`npm ci` in `reviewer-core/`).
  - No migration (NFR7). No schema file changes.
- Do-not-touch items near this change: `server/src/db/migrations/**`, `server/src/db/schema/**` (read only), `client/src/vendor/ui/**` (charts), `server/src/modules/reviews/run-executor.ts` (NG3), `server/clones/**`, lockfiles, `specs/**`.

## 3. Skill assignments
| Step | Skills the executing agent must read | Rules from the skill that shape this step |
|---|---|---|
| 1 | `zod` | Contracts are a PascalCase const plus an identically named `z.infer` type (root AGENTS.md). `.nullable()` vs `.nullish()` per field. Additive only, so existing fields are untouched. |
| 2 | `onion-architecture` (`references/layers.md`) | `domain.ts` is Core: pure functions, no drizzle, no runtime zod (SKILL.md "Decisions" 2, "The files of a module"). |
| 3 | `onion-architecture`, `drizzle-orm-patterns` | Repository implements the port and maps rows → domain types; ports never expose Drizzle types (Checklist CRITICAL "port signature exposes an infrastructure type"). Bound parameters only. |
| 4 | `onion-architecture`, `fastify-best-practices` | Service gets ports through the constructor; no new deps (Workflow "Create" 3). Route unchanged: Zod parsing stays at the boundary. |
| 5, 6 | `frontend-ui-architecture` (+ `references/this-repo.md`) | Colocation first; move to shared when a second consumer appears. `src/components/<kebab>/Pascal.tsx` with `styles.ts` + `index.ts` (named and default). Shared non-hook logic goes in flat topic modules in `src/lib/`, no `utils/`. |
| 7 | `frontend-ui-architecture`, `react-best-practices` | Data path `lib/api.ts` → `lib/hooks/*` → component (this-repo.md "One data path"). Server data stays in TanStack Query, not `useState`. |
| 8 | `frontend-ui-architecture` | One file per namespace under `client/messages/en/`, camelCase keys nested by UI surface, no inline JSX strings. |
| 9, 10 | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `security` | Business rules as plain functions in `helpers.ts`, not in JSX ("Business rules inside JSX" anti-pattern). Derive instead of storing. Untrusted skill names and memory labels are rendered as text only, with no `dangerouslySetInnerHTML` (security A05 XSS). |
| 11 | `frontend-ui-architecture` | Tab descriptor in `AgentEditor/constants.ts`; `VALID_TABS` derives from it (`page.tsx:17-18`). |
| Tests (§5) | `onion-architecture` `references/testing.md`; `react-testing-library`; `spec-writing` `references/ears.md` | Domain is pure-unit; the service uses fakes of ports; the repository is tested in `*.it.test.ts`. RTL queries by role/text; `data-<thing>` hooks. |

## 4. Steps

### Step 1 — Extend the `AgentStats` contract in both shared copies  (package: server + client vendor/shared)
- Covers: AC5, AC7, AC8, AC9, AC10, AC11, AC21 (`has_any_runs`), NFR4, NFR7
- Files: `server/src/vendor/shared/contracts/observability.ts`, `client/src/vendor/shared/contracts/observability.ts`, `server/test/contracts.test.ts` (existing fixture at :563-591 now lacks required fields, so the implementer must update it)
- Context:
  - `AgentStats` is at `observability.ts:105-133` in both copies, inside the block from `// Per-agent Stats` (:89) to `// Cross-session memory curator` (:136).
  - Parity test: `server/test/contracts.test.ts:479-484`.
  - `PerfSeriesPoint` is at `server/src/vendor/shared/contracts/productionize.ts:140` and is NOT importable here: `productionize.ts:3` imports `observability.js`.
- Change: inside the Per-agent Stats block, before `AgentStats`, add these consts with their types:
  - `AgentStatsSeriesPoint = z.object({ label: z.string(), value: z.number().int() })`
  - `SeverityBucketPoint = z.object({ label: z.string(), CRITICAL: int, WARNING: int, SUGGESTION: int })`
  - `FindingsByCategory = z.object({ bug, security, perf, style, test, other })`, all int
  - `SkillUsageItem = { name: string, linked: boolean, runs: int, share: number.nullable() }`
  - `SkillsUsage = { runs_with_data: int, runs_without_data: int, data_from: string.nullable(), items: SkillUsageItem[] }`
  - `MemoryUsageItem = { label: string.max(200), truncated: boolean, pr: int.nullish(), runs: int, share: number.nullable() }`
  - `MemoryUsage = { runs_with_data, runs_without_data, data_from (nullable), entries_total: int, items: MemoryUsageItem[].max(10) }`

  Then append to `AgentStats`:
  - `has_any_runs: z.boolean()`
  - `previous_runs: int`
  - `previous_avg_cost_usd: number.nullable()`
  - `previous_avg_latency_ms: number.nullable()`
  - `previous_accept_rate: number.nullable()`
  - `previous_decided: int`
  - `runs_series: AgentStatsSeriesPoint[]`
  - `severity_bucket: z.enum(['day','week'])`
  - `findings_by_severity_series: SeverityBucketPoint[]`
  - `findings_by_category: FindingsByCategory`
  - `skills_usage: SkillsUsage`
  - `memory_usage: MemoryUsage`

  Paste the identical text into both copies. Update the existing contracts test fixture so it still parses.
- Skills: zod — PascalCase const + `z.infer` type; nullability per spec Contracts.
- Done when: both copies are byte-identical in the block; `.claude/scripts/check-changed.sh server` typecheck fails only in `domain.ts` `buildAgentStats` (fixed in Step 2). This is the one allowed red state between Steps 1 and 2, inside one phase.
- Depends on: —
- Agent: implementer — Phase: 1

### Step 2 — Pure domain: previous period, series, category, usage  (package: server)
- Covers: AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, EC6, EC9-EC16, EC18, EC19, NFR4
- Files: `server/src/modules/agent-performance/domain.ts`, `server/src/modules/agent-performance/constants.ts`, `server/test/agent-performance-domain.test.ts` (update the existing `buildAgentStats` call at :282-288 for the new required inputs; implementer, because the change breaks it)
- Context:
  - `previousPeriod` is at `domain.ts:56-59`, `runsSeries` at :66-76, `indexFindings` at :78-86, `aggregateAgent` at :110-182, the current-only `buildAgentStats` at :347-387, and the dashboard current/prior split pattern at :240-250.
  - Constants are at `constants.ts:1-14` (`DAY_MS`, `HOUR_MS`).
  - Signature used: `aggregateAgent(runs: PerfRun[], findingsByRun: FindingsByRun, estimate: CostEstimator): AgentAggregate`.
- Change:
  - `constants.ts`:
    - `SEVERITY_DAILY_MAX_MS = 14 * DAY_MS`
    - `WEEK_MS = 7 * DAY_MS`
    - `FINDING_CATEGORIES = ['bug','security','perf','style','test'] as const`
    - `MEMORY_ITEMS_MAX = 10`
    - `MEMORY_LABEL_MAX = 200`
  - `domain.ts` new types:
    - `PerfCategoryCount { category: string; total: number }`
    - `PerfRunTrace { runId: string; ranAt: Date; skillsUsed: unknown; memoryPulled: unknown }` (raw jsonb sub-values; one row per counted `done` run in the current period, nulls when there is no trace)
  - New pure functions (exported for tests):
    - `severityBucketMs(p)`: 1 day when `to−from ≤ SEVERITY_DAILY_MAX_MS`, else 7 days.
    - `severitySeries(p, runs, findingsByRun)`: buckets aligned to `from`; `count = max(1, ceil(len/size))`, so the last bucket is shortened at `to`. A finding falls into the bucket of its run's `ranAt`. Only the three severities are counted.
    - `categoryBreakdown(counts)`: all six keys; anything not in `FINDING_CATEGORIES` → `other`.
    - `readSkillsUsed(v: unknown): string[] | null`: an array of only strings, else null.
    - `readMemoryPulled(v: unknown): { pr: number | null; text: string }[] | null` (D-P7).
    - `skillsUsage(traces, linkedNames)`: union of trace names and linked names, one row per name (EC12). `linked = linkedNames.has(name)`. `share = runs / runs_with_data` or null. `runs_without_data = traces.length − runs_with_data`. `data_from` = ISO of the earliest with-data run. Sort by share desc (null last), then `name.localeCompare`.
    - `memoryUsage(traces)`: group by exact full text and count a run once per text. `label = text.slice(0, 200)`, `truncated = text.length > 200`. `pr` comes from the first pull in ranAt order. Sort by share desc then label, keep the top `MEMORY_ITEMS_MAX`, set `entries_total` = distinct count.
  - `buildAgentStats` new input: `{ period, agent, runs, findings, categories, traces, linkedSkillNames: string[], hasAnyRuns, estimate }`, where `runs`/`findings` cover `[previous.from, to)`.
    - Split current/prior exactly as `buildAgentPerformance` does (:244-245).
    - `a = aggregateAgent(current…)`, `prev = aggregateAgent(prior…)`.
    - New fields: `previous_runs = prev.runs`, `previous_avg_cost_usd = prev.avg_cost_usd`, `previous_avg_latency_ms = prev.avg_latency_ms`, `previous_accept_rate = prev.accept_rate`, `previous_decided = prev.decided`.
    - `runs_series = runsSeries(period, current)`. `severity_bucket`, the severity series built from `current`, category, both usage blocks, and `has_any_runs`.
    - Existing fields keep their values (NFR7).
  - The response never carries trace text other than skill names and labels capped at 200 characters (NFR4).
- Skills: onion-architecture — Core is pure: no drizzle, no fastify, no runtime zod (guards are hand-written type checks).
- Done when: server `tsc --noEmit` passes; the existing `agent-performance-domain.test.ts` passes, including the AC9 parity test at :273.
- Depends on: Step 1
- Agent: implementer — Phase: 1

### Step 3 — Port + repository read methods  (package: server)
- Covers: AC9, AC10, AC11, AC12, AC21, AC22, NFR1, NFR3, NFR4; prerequisite of Step 4
- Files: `server/src/modules/agent-performance/ports.ts`, `server/src/modules/agent-performance/repository.ts`, `server/test/agent-performance-service.test.ts` (`FakeRepo implements` the port at :16, so it breaks; add the stub methods and update the method list at :99)
- Context:
  - Port is at `ports.ts:4-13`.
  - `countFindingsByRun` join pattern is at `repository.ts:45-66`, `hasAnyFinishedRun` at :68-75, and `runFilter` at :78-86.
  - Tables: `t.runTraces { runId, trace }` (`server/src/db/schema/runs.ts:36-41`), `t.agentSkills { agentId, skillId }` (`schema/agents.ts:51-63`), `t.skills.name`/`workspaceId` (`schema/skills.ts:7,10`), `t.findings.category` (`schema/reviews.ts:38`).
- Change:
  - Port, add:
    - `countFindingsByCategory(workspaceId, period, agentId): Promise<PerfCategoryCount[]>`
    - `listRunUsageTraces(workspaceId, period, agentId): Promise<PerfRunTrace[]>`
    - `listLinkedSkillNames(workspaceId, agentId): Promise<string[]>`
  - Port, widen `hasAnyFinishedRun(workspaceId, agentId?)`.
  - Repository:
    - Category query: same joins and `runFilter` as `countFindingsByRun`, grouped by `t.findings.category`, `count(*)::int`.
    - Usage query: `agent_runs LEFT JOIN run_traces`, with `runFilter` + `status = 'done'`. Select only `id`, `ranAt` and two projections: `case when jsonb_typeof(trace)='object' then trace #> '{prompt_assembly,skills_used}' end` and `… trace -> 'memory_pulled' …`. Never select `trace` itself (NFR4/NFR1).
    - Linked names: `agent_skills JOIN skills`, filtered by agent and `skills.workspace_id`.
    - `hasAnyFinishedRun`: add `agentId ? eq(t.agentRuns.agentId, agentId) : undefined`.
  - All of these are SELECT-only (NFR3).
- Skills: onion-architecture, drizzle-orm-patterns — the port speaks domain types; the repository maps rows; no `$inferSelect` in the port.
- Done when: server typecheck passes; the onion gate in `check-changed.sh server` reports no new violation.
- Depends on: Step 2
- Agent: implementer — Phase: 1

### Step 4 — Service: read previous+current window, wire new reads  (package: server)
- Covers: AC5, AC6, AC21, AC22, NFR3, NFR8
- Files: `server/src/modules/agent-performance/service.ts`, `server/test/agent-performance-service.test.ts` (the existing test "agentStats reads only the current period" at :52-58 contradicts the new behaviour; the implementer updates it to expect `[previous.from, to)`)
- Context:
  - `agentStats` is at `service.ts:39-58` and the failure log at :60-66.
  - Pattern to copy: `performance()` at :22-37 (`window = { from: previousPeriod(period).from, to: period.to }`).
  - Route at `routes.ts:47-54` is unchanged.
  - The container at `server/src/platform/container.ts:246-248` is unchanged, because the deps are the same.
- Change:
  - After `findAgent` (404 stays outside the try), `Promise.all` these reads:
    - `listFinishedRuns(ws, window, agentId)`
    - `countFindingsByRun(ws, window, agentId)`
    - `countFindingsByCategory(ws, period, agentId)`
    - `listRunUsageTraces(ws, period, agentId)`
    - `listLinkedSkillNames(ws, agentId)`
    - `hasAnyFinishedRun(ws, agentId)`
  - Pass the results to `buildAgentStats`. Keep the catch → `fail(ctx, 'GET /agents/:id/stats', period)` → `AggregationFailedError`. Nothing new is logged, and a malformed trace is never logged (NFR8).
- Skills: onion-architecture — narrow deps object, no `Container`, no zod re-parse.
- Done when: `.claude/scripts/check-changed.sh server --full` passes (hermetic suite + typecheck + onion gate).
- Depends on: Step 3
- Agent: implementer — Phase: 1

### Step 5 — Extract the period picker to a shared component  (package: client)
- Covers: AC2, AC3, AC4 (prerequisite of Step 9; dashboard behaviour unchanged, NG7)
- Files:
  - NEW `client/src/components/period-picker/PeriodPicker.tsx`
  - NEW `client/src/components/period-picker/styles.ts`
  - NEW `client/src/components/period-picker/helpers.ts`
  - NEW `client/src/components/period-picker/constants.ts`
  - NEW `client/src/components/period-picker/index.ts`
  - delete `client/src/app/agent-performance/_components/AgentPerformanceView/_components/PeriodPicker/` (PeriodPicker.tsx, index.ts)
  - edit `AgentPerformanceView/helpers.ts`, `constants.ts`, `styles.ts`, `AgentPerformanceView.tsx`
  - edit the import block only of `AgentPerformanceView/helpers.test.ts` (an existing test broken by the move)
- Context:
  - Picker: `.../PeriodPicker/PeriodPicker.tsx:1-103` (uses `useTranslations("agentPerformance")`, `../../helpers`, `../../styles`).
  - Helpers to move: `helpers.ts:5-74`, which holds `Range`, `UiPeriod`, `CustomRangeError`, `presetPeriod`, `parsePeriodQuery`, `periodToSearch`, `toDateInput`, `customRangeToPeriod`, `periodToDateInputs`.
  - Constants to move: `constants.ts:4-13` (`DEFAULT_RANGE`, `RANGES`, `MAX_CUSTOM_DAYS`, `MAX_PERIOD_MS`, `HOUR_MS`, `DAY_MS`).
  - Styles to move: `styles.ts:21-35` (picker keys).
  - Consumer: `AgentPerformanceView.tsx:11,16,82`.
  - `seriesUnit` (`helpers.ts:77-79`) stays in the dashboard and imports `DAY_MS`/`HOUR_MS` from the shared module.
- Change: move the code verbatim with these exceptions:
  - The error id uses `React.useId()` (D-P2).
  - The file header comment says the picker reads the `agentPerformance.period.*` keys on purpose.
  - `index.ts` exports `PeriodPicker` named + default plus the helpers, types and constants.
  - The dashboard imports from `@/components/period-picker`.
- Skills: frontend-ui-architecture — kebab-case folder under `src/components/`, PascalCase file; `styles.ts` `export const s`; no re-export barrel chains.
- Done when: client `tsc --noEmit` passes, and `AgentPerformanceView.test.tsx` plus the dashboard `helpers.test.ts` pass unchanged in behaviour.
- Depends on: —
- Agent: implementer — Phase: 2

### Step 6 — Shared metric formatters  (package: client)
- Covers: AC13, AC14 (prerequisite of Step 10)
- Files:
  - NEW `client/src/lib/agent-metrics.ts`
  - `client/src/components/run-cost-badge/helpers.ts`, `client/src/components/run-cost-badge/index.ts`
  - `AgentPerformanceView/helpers.ts`, `constants.ts`, `_components/KpiCards/KpiCards.tsx`, `_components/PerfRow/PerfRow.tsx`
  - the import block of `AgentPerformanceView/helpers.test.ts`
- Context:
  - `formatSignedCost`/`formatPercent`/`formatDuration` are at `AgentPerformanceView/helpers.ts:127-142`, and `SMALL_SAMPLE_THRESHOLD` at `constants.ts:2`.
  - `formatCost` is at `run-cost-badge/helpers.ts:22-28`; the index is at `run-cost-badge/index.ts:2`.
  - Consumers: `KpiCards.tsx:8`, `PerfRow.tsx:9`.
- Change:
  - Move `formatSignedCost` into `run-cost-badge/helpers.ts` and export it from its index.
  - Move `formatPercent`, `formatDuration` and `SMALL_SAMPLE_THRESHOLD` into `lib/agent-metrics.ts` (header: "shared by the dashboard and the agent Stats tab; SPEC-04 values").
  - Re-point dashboard imports.
- Skills: frontend-ui-architecture — shared non-hook logic goes in a flat topic module in `src/lib/`; cost formatting stays with `formatCost`.
- Done when: client typecheck passes, and the dashboard tests pass.
- Depends on: Step 5
- Agent: implementer — Phase: 2

### Step 7 — `useAgentStats` data hook  (package: client)
- Covers: AC2, AC3, AC20, AC22, NFR2, EC20
- Files: NEW `client/src/lib/hooks/agent-stats.ts`; `client/src/lib/hooks/index.ts` (add `export * from "./agent-stats";`)
- Context: pattern file `client/src/lib/hooks/agent-performance.ts:1-29` (key, path, `retry: false`, no `placeholderData`). The barrel is at `lib/hooks/index.ts:15`.
- Change:
  - `agentStatsKey(agentId, period)` → `["agent-stats", agentId, from, to]`.
  - `agentStatsPath(agentId, period)` → `` `/agents/${encodeURIComponent(agentId)}/stats?${new URLSearchParams({from,to})}` ``.
  - `useAgentStats(agentId, period)` is a `useQuery` of `api.get<AgentStats>` with `retry: false` and no placeholderData, so a new period never shows old numbers (EC20) and errors surface immediately (AC20). The hook is GET only.
- Skills: frontend-ui-architecture ("One data path"), react-best-practices (server data in the query cache).
- Done when: client typecheck passes.
- Depends on: —
- Agent: implementer — Phase: 2

### Step 8 — `agentStats` i18n namespace  (package: client)
- Covers: NFR6; prerequisite of Steps 9-11 (AC13-AC21 texts)
- Files: NEW `client/messages/en/agentStats.json`
- Context:
  - Namespaces are auto-loaded (root AGENTS.md "i18n"). The tab label already exists at `client/messages/en/agents.json:54`.
  - Estimate label/explanation are reused from `client/messages/en/agentPerformance.json:37-40`, and the picker strings from :6-20.
- Change: keys (camelCase, nested by surface):
  - `loadError`
  - `periodLabel.preset` ("{preset} · {from} – now"), `periodLabel.custom` ("{start} – {end}"), `periodLabel.oneDay`, `periodLabel.thirtyDays`
  - `kpi.label`, `totalRuns`, `avgCost`, `avgDuration`, `acceptRate`
  - `kpi.runsSeriesAlt` ("{count} runs, by {unit}"), `unitHour`, `unitDay`
  - `kpi.decidedBasis` ("based on {count, plural, one {# decided finding} other {# decided findings}}")
  - `kpi.delta` ("{delta} vs previous period"), `kpi.deltaPoints` ("{delta} pp vs previous period"), `kpi.noHistory` ("Not enough history to compare")
  - `skills.title`, `skills.description` ("Share of runs whose prompt included the skill", D2), `skills.empty` ("No skills in this period"), `skills.rowAlt` ("{name}: {percent} of runs")
  - `memory.title`, `memory.description`, `memory.empty` ("No memory pulled in this period"), `memory.more` ("+{count} more"), `memory.rowAlt`
  - `coverage.basedOn` ("Based on {n} of {m} runs"), `coverage.noDataBefore` ("No data before {date}")
  - `severity.title`, `critical`, `warning`, `suggestion`, `severity.week` ("W{n}"), `severity.barAlt` ("{label}: {critical} critical, {warning} warning, {suggestion} suggestion"), `severity.footer` ("{count, plural, one {# finding} other {# findings}} in period")
  - `category.title`, `category.centerAlt`, `category.legendItem` ("{category} {count} · {percent}"), `category.legendZero` ("{category} {count}"), `category.smallSample` ("Small sample"), `category.names.{bug,security,perf,style,test,other}`
  - `empty.notRunTitle`, `notRunBody`, `noRunsInPeriodTitle`, `noRunsInPeriodBody` (hint to widen the period)
  - No "billed" text anywhere (AC14).
- Skills: frontend-ui-architecture — one file per namespace, no inline JSX strings.
- Done when: the JSON is valid; Steps 9-10 reference only keys that exist.
- Depends on: —
- Agent: implementer — Phase: 2

### Step 9 — StatsTab container: URL period, request, states  (package: client)
- Covers: AC2, AC3, AC13 (delta rules in helpers), AC17/AC18 (label/legend helpers), AC19, AC20, AC21, AC22 (client), EC19-EC22, NFR2, NFR5
- Files (StatsTab is a component folder under `AgentEditor/_components/`, with own styles/constants/helpers like `SkillsTab`):
  - NEW `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab.tsx`
  - NEW `.../StatsTab/styles.ts`
  - NEW `.../StatsTab/constants.ts`
  - NEW `.../StatsTab/helpers.ts`
  - NEW `.../StatsTab/index.ts`
- Context:
  - Pattern to copy for states, fallback period and URL: `client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.tsx:20-74` (`useState(() => presetPeriod("30d", Date.now()))`, `parsePeriodQuery`, skeleton/error/empty branches).
  - `setTab` keeps other query values (`client/src/app/agents/[id]/page.tsx:51-55`), and an agent switch pushes `?tab=` only (`page.tsx:111`).
  - Sibling index shape: `.../SkillsTab/index.ts:1`.
  - UI primitives: `EmptyState`, `ErrorState`, `Skeleton`, `Sparkline` from `@devdigest/ui`.
- Change:
  - `StatsTab({ agent })`:
    - period = URL or a stable 30-day fallback.
    - `useAgentStats(agent.id, period)`.
    - `selectPeriod(p)` copies the current `useSearchParams()`, sets `from`/`to`/`range` and `tab=stats`, then calls `router.replace('/agents/${agent.id}?…')`.
    - Header: period label + shared `PeriodPicker`.
    - States, on a root `data-agent-stats` + `data-state`:
      - loading: `aria-busy` skeletons for 4 KPI cards and the 4 panels, with no numbers (AC19).
      - error: `ErrorState` with `agentStats.loadError` and `onRetry={refetch}` (AC20).
      - `runs === 0`: two `EmptyState`s chosen by `has_any_runs` (AC21); the picker stays rendered.
      - ready: the Step 10 children.
  - `helpers.ts` pure functions:
    - `periodLabelParts(period, now)` returns preset with `MMM d` of `from` via `Intl.DateTimeFormat("en",{month:"short",day:"numeric"})`, or custom with start and end (end = `to − 1 ms`).
    - `runsUnit(period)`: hour when `to−from ≤ 48h`, mirroring server `HOURLY_BUCKET_MAX_MS` (`server/src/modules/agent-performance/constants.ts:11`).
    - `runsDelta`, `costDelta`, `durationDelta`, `acceptDeltaPoints`: each returns null when either side is null or `previous_runs` is 0, and `acceptDeltaPoints` also when `decided` or `previous_decided` is below `SMALL_SAMPLE_THRESHOLD` (AC13).
    - `signed(n)` uses "+"/"−".
    - `severityLabels(series, bucket)`: `W1..Wn` or local `MMM d`.
    - `categoryLegend(byCategory, total)`: five rows plus `other` when above 0; percent `Math.round(count/total*100)` only when count > 0.
    - `isSmallSample(n)`.
  - `constants.ts`: `CATEGORY_ORDER`, donut colours (CSS vars), skeleton counts, `MEMORY_LABEL_MAX` not needed.
- Skills: frontend-ui-architecture (rules in helpers, not JSX; derive, don't store), react-best-practices, next-best-practices (`"use client"` at the leaf).
- Done when: client typecheck passes; the tab renders all four states under a mocked fetch (verified by test-writer).
- Depends on: Steps 5, 6, 7, 8
- Agent: implementer — Phase: 2

### Step 10 — StatsTab children: KPI cards and four panels  (package: client)
- Covers: AC13, AC14, AC15, AC16, AC17, AC18, EC3, EC5, EC8, EC13-EC17, EC26, EC27, NFR5, untrusted skill names / memory texts (render as text)
- Files (nested children; each is `Child.tsx` + named-only `index.ts`, styles from `../../styles`):
  - NEW `.../StatsTab/_components/StatsKpiCards/`
  - NEW `.../StatsTab/_components/UsagePanel/` (generic list panel used for skills and memory, with rows, bar, share, footer, empty text and "+K more")
  - NEW `.../StatsTab/_components/SeverityBars/`
  - NEW `.../StatsTab/_components/CategoryDonut/`
- Context:
  - KPI card pattern (sparkline with `role="img"` alt, `estimateTag` + sr-only explanation, `aria-describedby`): `client/src/app/agent-performance/_components/AgentPerformanceView/_components/KpiCards/KpiCards.tsx:40-82`.
  - Donut pattern (fixed-size recharts `PieChart`, `aria-hidden` ring, text legend): `.../CostDonut/CostDonut.tsx:16-71`.
  - Formatters: `formatCost` from `@/components/run-cost-badge`; `formatSignedCost`, `formatPercent`, `formatDuration`, `SMALL_SAMPLE_THRESHOLD` from Step 6.
- Change:
  - `StatsKpiCards`: Total runs (+ sparkline of `runs_series`, alt text), Avg cost / run (Estimated label + explanation via `agentPerformance.estimate.*`, `formatCost`), Avg duration, Accept rate (`formatPercent`, `decidedBasis`). Each card shows either a signed delta text or `kpi.noHistory`, with neutral colour so direction is carried by the sign only (EC27). The cards are `data-kpi="runs|avg-cost|avg-duration|accept-rate"`, and the delta element is `data-kpi-delta`.
  - `UsagePanel`, used for the skills block with rows `data-skill-row` and for the memory block with rows `data-memory-row`:
    - Each row renders its name/label as text with `title` = full label, an `aria-hidden` bar of width `share*100%` plus an sr text alt, and the share in whole percent or "—".
    - Footer: `coverage.basedOn` with N = `runs_with_data`, M = with + without, plus `noDataBefore` only when `runs_without_data > 0`, with the date from `data_from`. Without `data_from`, the footer omits the date.
    - Empty text when `items` is empty (skills: `skills.empty`; memory: `memory.empty`).
    - Memory adds `memory.more` when `entries_total > items.length`.
  - `SeverityBars`: one bar per bucket (`data-severity-bucket`), stacked divs per severity, each bar `role="img"` with `severity.barAlt`. There is a text legend, and the footer N = Σ `findings_by_severity`.
  - `CategoryDonut`: ring `aria-hidden`, centre `findings_total`, legend rows `data-category-row`, and the `category.smallSample` marker when `findings_total < SMALL_SAMPLE_THRESHOLD`.
  - No `dangerouslySetInnerHTML` anywhere.
- Skills: frontend-ui-architecture (nested children share parent styles, named-only index), react-best-practices, security (A05: text-only rendering of DB strings).
- Done when: client typecheck passes; `next build` succeeds (no runtime import from `@devdigest/shared`).
- Depends on: Step 9
- Agent: implementer — Phase: 2

### Step 11 — Register the Stats tab in the editor  (package: client)
- Covers: AC1, EC21, EC22, NFR5
- Files: `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`
- Context:
  - `TABS` is at `constants.ts:11-15`, and the panel switch at `AgentEditor.tsx:29-35`.
  - `VALID_TABS` derives from `TABS` (`page.tsx:17-18`), so `?tab=stats` becomes valid with no page edit.
  - The icon `BarChart` exists in the `Icon` registry (`client/src/vendor/ui/icons.tsx:76,159`).
- Change: append `{ key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" }` after `context`, and add a `tab === "stats"` branch rendering `<StatsTab key={agent.id} agent={agent} />`. Add no Evals or CI entries.
- Skills: frontend-ui-architecture.
- Done when: `.claude/scripts/check-changed.sh client --full` passes; `./node_modules/.bin/next build` in `client/` succeeds.
- Depends on: Step 10
- Agent: implementer — Phase: 2

## 5. Test plan
- Existing suites to run:
  - Per step: `.claude/scripts/check-changed.sh server` / `client`. At the end of each phase: `--full`.
  - Docker lane: `.claude/scripts/check-changed.sh server --it`, for `server/test/agent-performance.it.test.ts`, `server/test/agent-performance-perf.it.test.ts` and the new `agent-stats*.it.test.ts`. These must still pass, as they cover dashboard parity (NG7, NFR7).
- Tests to add or change (owner: test-writer, multi-agent; run server tests first, then client, sequentially in the same checkout):
  - `server/test/agent-performance-domain.test.ts` — covers AC5, AC7, AC8, AC9, AC10, AC11, AC12, NFR4 — hermetic. Asserts:
    - previous-period fields, including all-null averages with no prior runs.
    - `runs_series` sum = runs and bucket count, for 1-day and 30-day periods.
    - severity series: 30 days → 5 week buckets, the last covering 2 days; 1 day → 1 day bucket; 366 days → 53 buckets; per-severity sums.
    - `"api"` category → `other`; six keys always present.
    - skills: 4 traced runs, A in 4, B in 2, linked C → 1.0/0.5/0.0 with `linked` flags and ordering; failed runs are excluded from denominators; duplicate linked names collapse to one row.
    - memory: 12 texts → 10 items, `entries_total` 12; the same text twice in one run counts once; a 250-char text → label length 200, `truncated` true.
    - malformed values (`{foo:1}`, non-array, non-string entries) → `runs_without_data`.
  - `server/test/agent-performance-service.test.ts` — covers AC5, NFR8 — hermetic. Asserts that agentStats reads `[previous.from, to)` with the agentId, that 404 reads nothing, the single metadata-only failure log, and that the port is read-only (method list).
  - NEW `server/test/agent-stats.it.test.ts` — covers AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC21 (`has_any_runs`), AC22/NFR3 — it. Copy the `world()` + `countingLlm()` harness from `server/test/agent-performance.it.test.ts:36-120`. Asserts:
    - seeded runs, findings and traces in both windows.
    - field-by-field equality with the `/agents/performance` row for 1-day, 30-day and custom periods, including `previous_accept_rate`/`previous_decided`.
    - a trace jsonb `{ "foo": 1 }` and a run with no trace row → 200, counted in `runs_without_data`.
    - an old trace without `skills_used`.
    - linked skill rows (`agent_skills`).
    - a finding of a review with `run_id` null is invisible (EC25).
    - `agent_runs`/`run_traces` counts unchanged and LLM calls = 0.
    - 404 for an unknown agent; 422 for a bad period.
  - NEW `server/test/agent-stats-perf.it.test.ts` — covers NFR1 — it. Copy `server/test/agent-performance-perf.it.test.ts`, but give one agent 10,000 `done` runs, each with a `run_traces` row whose trace carries `prompt_assembly.skills_used` and `memory_pulled: []`, plus 50,000 findings across current and previous periods. Asserts p95 of 20 GETs `/agents/:id/stats` ≤ 1000 ms.
  - `server/test/contracts.test.ts` — covers NFR4, NFR7 — hermetic. The existing Per-agent Stats block-parity test must pass. Add: a full new-shape `AgentStats` parses; `memory_usage.items` > 10 and a label > 200 chars fail; a key-set assertion that the response schema has no prompt/diff/raw-output fields.
  - `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` — covers AC1, NFR5 — client. Asserts the Stats tab is fourth after Context, there are no Evals/CI tabs, the Stats tab button is focusable (`el.focus()` + `toHaveFocus()`), and `tab="stats"` renders the Stats panel (wrap in QueryClientProvider, mock `next/navigation`).
  - NEW `.../StatsTab/StatsTab.test.tsx` — covers AC2, AC3, AC4, AC13, AC14, AC15, AC16, AC17, AC18, AC19, AC20, AC21, AC22 (client), NFR2, NFR5, NFR6 — client. Copy the URL-store `next/navigation` mock and fetch stub from `client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.test.tsx:9-63`. Asserts:
    - exactly one GET per open and per period pick; URL holds `tab=stats&from&to&range`; a reload requests the same period; an invalid URL falls back to 30 days.
    - invalid custom range → `role="alert"` and no request.
    - delta text with sign / "Not enough history to compare" (cost null; accept < 10 decisions); no "billed" text; cost formats "—"/"$0.00"/"<$0.0001".
    - `data-skill-row` order, "—" share, coverage footer with and without the date; a skill name containing `<img onerror>` renders as literal text.
    - memory empty text and "+2 more".
    - bar count and W labels; footer N.
    - legend "security 4 · 67%", "perf 0", small-sample marker at 6 and not at 10.
    - loading: no digits/"$"/"%"; error 404 and 429 → message + Retry re-requests.
    - both empty states, with the picker still usable.
    - only `/agents/:id/stats` GETs are made.
  - NEW `.../StatsTab/helpers.test.ts` — covers AC2, AC13, AC17, AC18 — client. Pure label, delta, severity-label and legend helpers.
  - `client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.test.tsx` and `helpers.test.ts` — regression for NG7 — client. Must pass after Steps 5-6; test-writer may relocate the period tests to NEW `client/src/components/period-picker/helpers.test.ts`.
- Needs Docker: yes (it lane: `agent-stats.it.test.ts`, `agent-stats-perf.it.test.ts`, existing `agent-performance*.it.test.ts`).

## 6. Risks and open questions
- Spec gap EC4 vs AC13 (runs delta when `previous_runs = 0`). Resolved: AC13 revised, EC4 wins.
- NFR1 vs trace size: `#>`/`->` on `run_traces.trace` detoasts the whole jsonb, and real traces hold full prompts (server INSIGHTS "Prompt logs are metadata-only"). The perf test seeds small traces, so it may pass while large real traces are slower. Mitigation: project only the two sub-paths (D-P5) and measure. If the budget fails, the fix needs a stored projection (a migration), which NFR7 excludes, so it goes back to spec-creator. Owner: implementer reports, user decides.
- Severity series vs `findings_total`: AC17's footer uses Σ `findings_by_severity`, and findings with a severity outside the three are in `findings_total` but in no bar. This is accepted as per spec; it is not a planning issue.
- `skills_used` holds enabled skills only (`server/src/modules/reviews/helpers.ts:14-16` per spec), so a linked-but-disabled skill always shows 0% (EC9, intended).
- The shared PeriodPicker reads the `agentPerformance` namespace (D-P2). Any screen using it must load that namespace; StatsTab tests must provide both `agentStats` and `agentPerformance` messages.
- Dashboard regression risk from the Step 5/6 moves. Gate: the existing dashboard tests at the end of Phase 2.

## 7. Not verified
- That `jsonb #> '{a,b}'` / `-> 'k'` return NULL rather than raising on a non-object jsonb. The `jsonb_typeof(trace)='object'` guard in Step 3 covers it either way, and the AC12 IT test exercises it. Source: Postgres semantics from memory; not run here.
- Run-executor anchors (`run-executor.ts:241-243,390,412,600`, `helpers.ts:14-16`) were taken from the spec, not re-read. They are only context; no step edits those files.
- Whether `client/src/i18n/request.ts` auto-loads a new namespace file. Root AGENTS.md says "A new file is picked up automatically"; the file was not read.
- The vendor `Tabs` keyboard semantics (it renders buttons per the existing `AgentEditor.test.tsx:140`); arrow-key behaviour was not inspected.
- `server/docs/README.md` / `client/README.md` mention the endpoint/route (found by Grep); exact sections to update are left to doc-writer.

## 8. Execution mode
- Mode: multi-agent — chosen by: user (via coordinator, same as SPEC-04).
- Phases:
  - Phase 1 — server (+ paired `vendor/shared` contracts in both packages) — steps 1, 2, 3, 4 — check: `.claude/scripts/check-changed.sh server --full` (and `client` typecheck, because the client shared copy changed)
  - Phase 2 — client — steps 5, 6, 7, 8, 9, 10, 11 — check: `.claude/scripts/check-changed.sh client --full`, plus `./node_modules/.bin/next build` in `client/`
- Hand-off order:
  1. `implementer` — Phase 1 — this plan §4 Steps 1-4 — server code + both contract copies + the minimal fixes to existing broken tests.
  2. `implementer` (fresh run) — Phase 2 — Steps 5-11 — client code.
  3. `plan-verifier` (scope code) — read-only — checks §4 against the diff.
  4. `architecture-reviewer` + `security-reviewer` — **in parallel (read-only)**. Security focus: NFR4 (no trace text beyond names/labels), text-only rendering of skill names and memory labels, period validation unchanged.
  5. Bounded fix loop via `implementer` if reviewers raise findings.
  6. `test-writer` — §5. Server tests first, then client, in one run or two sequential runs; never parallel with another writer.
  7. `plan-verifier` (scope final) — runs `check-changed.sh server client --full --it` (Docker) and maps every AC to a passing test.
  8. `doc-writer` — `server/README.md` API map (new `AgentStats` fields), `server/docs/README.md`, `client/README.md` (Stats tab in the agent editor route), and candidate INSIGHTS entries (shared PeriodPicker reads the `agentPerformance` namespace; `runsUnit` 48 h rule is hand-mirrored from server constants).
- Parallelism: only the two reviewers (read-only). All writers (`implementer`, `test-writer`, `doc-writer`) run sequentially on this checkout; `isolation: "worktree"` is needed only if someone chooses to parallelise writers, which is not planned.
- Gates: phase checks above; the plan-verifier code gate before reviews; the final verifier with `--it`; then `/pr-self-review` before any PR (CRITICAL blocks).
