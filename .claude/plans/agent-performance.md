# Implementation Plan: Agent Performance dashboard (SPEC-04)

## 0. Spec readiness
- Source: `specs/2026-10-18-agent-performance.md` (SPEC-04), `Status: approved` (spec line 3). The spec is untracked in git (git status at session start), so it needs committing with this work.
- Spec readiness: ready ACs AC1–AC23. Blocked ACs: None.
  - Self-check "For reviewers of a spec" (`.claude/skills/spec-writing/references/self-check.md:24-29`): items 1, 2, 3, 5, 8 and 15 pass. Every AC has an ID, an EARS form, an `_(observable: ...)_` hint and a Verify-by lane (Traceability, spec lines 358-382).
  - No `[NEEDS CLARIFICATION]` marker; OQ1–OQ6 are closed (spec lines 433-446). No AC conflicts with `AGENTS.md`, the INSIGHTS files or a skill rule (checks in §2).
- Spec gaps routed to spec-creator. None blocks an AC. Where the spec is silent, the plan picks the rule below and the step that implements it:
  1. **Existing contract fields with no period rule.** The spec keeps `provider`, `model`, `findings_total`, `dismiss_rate`, `avg_findings_per_run` and `trend` on `AgentPerfRow` (and the same on `AgentStats`), but defines a rule only for the fields listed in Contracts (spec lines 246-250). The plan uses (Step 2):
     - `provider`, `model` = the agent's current config (`agents.provider`, `agents.model`); null for the deleted-agent row;
     - `findings_total` = findings of the agent's counted runs in the period; `pending = findings_total − decided`;
     - `dismiss_rate = dismissed / decided`, null when `decided = 0` (mirrors AC7);
     - `avg_findings_per_run = findings_total / runs`, null when `runs = 0`;
     - `trend` = findings count of the last 10 counted runs, oldest to newest (`AgentStats.trend` uses the same values as `{ label: ran_at ISO, value }`).
     Blocks: none. No UI in this spec reads these fields.
  2. **Finding → run attribution.** Findings are linked to a run only through `reviews.run_id` (`server/src/db/schema/reviews.ts:20`, a plain uuid, no FK). A review with a null `run_id` is not counted in any metric. The seeded PR #482 review has no run, so its findings never appear on the dashboard. Blocks: none.
  3. **Row order inside "rows with runs".** The spec says only that rows with runs come first (spec line 238). The plan orders them by `runs` desc, then `last_run_at` desc, then name; the deleted-agent row comes last among them; rows without runs follow, by name. The client re-sorts anyway (AC14). Blocks: none.
  4. **The INSIGHTS "newest review per agent" rule does not apply here.** Root INSIGHTS "A PR-list rollup taken from the LATEST review…" counts only the newest review per agent on a PR. SPEC-04 EC17 (user-confirmed) counts every run's findings with that run. The plan follows the spec. spec-creator may want to cite the INSIGHTS entry in EC17. Blocks: none.
- Answered implementation questions:
  - Execution mode: multi-agent, four phases (contracts, server, client, main-session nav edit) (user, via the orchestrator).
  - NFR1 lane: option (a), a bulk-seeded `server/test/agent-performance-perf.it.test.ts` in the normal integration lane (user).
  - One spec, no split (OQ5); the spec defaults OQ1–OQ4 are accepted (user).
  - The vendored `client/src/vendor/ui/nav.ts` + `nav.test.tsx` edit is a main-session step (user; Step 12).
  - Branch `L08-hw` exists; no git steps beyond commit points (user).
- Recommendations:
  - Hybrid aggregation: the repository reads rows, one pure domain function aggregates them, and both endpoints share it — **accepted (in scope)**, Steps 2–5.
  - Static route `/agents/performance` plus a test that it is not matched as `/agents/:id` — **accepted (in scope)**, Step 5 and §5.
  - Reuse the vendored `Donut` / `Sparkline` / `MetricCard` — **accepted, but only partly applicable; the planner's correction is below, for the user to confirm (§6 Q1)**:
    - `Sparkline` is reused as is (`client/src/vendor/ui/charts/Sparkline.tsx:4-28`).
    - `Donut` cannot be reused as is. Its legend always prints `valuePrefix + value.toFixed(2)` (`client/src/vendor/ui/charts/Donut.tsx:44-51`), which shows a real $0.00004 as "$0.00". That breaks EC15 and client INSIGHTS "Formatting a cost at fixed 4dp reports cheap real runs as free". It also has no percentage (NFR5) and no Estimated label (AC19).
    - `MetricCard` cannot be reused as is. Its delta is `Math.abs(delta).toFixed(2)` with no sign or "$", and it is coloured green when the value goes up (`MetricCard.tsx:21-24,65`), so a cost increase would show as "good" and the direction would be carried by colour and an icon only (NFR5). Its `label` is a plain string, so the Estimated label (AC19) cannot be attached.
    - The vendor files cannot be edited by the implementer (root INSIGHTS "The implementer cannot apply a plan-sanctioned vendor edit"). The plan therefore builds an app-local `CostDonut` on `recharts` `PieChart`/`Pie`/`Cell` (the same primitives `Donut.tsx:3,24-42` uses; `recharts` is a client dependency, `client/package.json:25`) with its own legend, and app-local KPI cards that reuse `Sparkline`.
  - Not asked, not in scope: promote the relative-time formatter into `client/src/lib/relative-time.ts`. This plan adds a third route-local copy (the others are `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/helpers.ts:4` and `.../onboarding/_components/OnboardingView/helpers.ts:7`) because a route may not import another route's `_components`.
  - Not asked, not in scope: record in `server/INSIGHTS.md` through `engineering-insights` that `reviews.run_id` is the only finding → run link and has no FK (§0 gap 2). Owner: doc-writer.

## 1. Goal and scope
- Goal: add a read-only global Agent Performance screen at `/agent-performance`, reachable from a new GLOBAL sidebar section. It shows KPIs, a sortable and expandable per-agent table, and cost breakdowns by agent and by model for a chosen period. Two period-aware endpoints, `GET /agents/performance` and `GET /agents/:id/stats`, serve it from one shared server aggregation.
- In scope:
  - the `AgentPerf` / `AgentPerfRow` / `PerfCostSegment` / `AgentStats` contract extension in both vendored `shared` copies, plus the type re-exports in `client/src/lib/types.ts`;
  - a new server module `server/src/modules/agent-performance/` (constants, domain, ports, repository, service, routes), a container getter and a registry entry;
  - client: the `useAgentPerformance` hook, a rewrite of the `agentPerformance` i18n namespace, the route `client/src/app/agent-performance/page.tsx` and the `AgentPerformanceView` component tree;
  - the GLOBAL sidebar section in the vendored `nav.ts` and its test (main-session Step 12).
- Out of scope:
  - NG1–NG6: the agent-editor Stats tab, Memory / Multi-Agent Review / CI Runs entries, billing data, repo filter, export or auto-refresh, any storage change;
  - DB schema changes, migrations and indexes (NFR7);
  - `reviewer-core/**`, `mcp/**`, `e2e/**` (no e2e lane in the spec's Traceability);
  - `server/src/modules/agents/**` (the new routes live in their own module; see Step 5);
  - edits to `client/src/vendor/ui/**` other than `nav.ts` in Step 12.
- AC coverage:
  - AC1 — Step 12 (+ existing `activeKeyFor`) — `client/src/components/app-shell/nav.test.tsx` (main session, client); `client/src/components/app-shell/helpers.test.ts` (client)
  - AC2 — Steps 6, 8, 9 — `AgentPerformanceView.test.tsx` (client)
  - AC3 — Steps 8, 9 — `AgentPerformanceView/helpers.test.ts`, `AgentPerformanceView.test.tsx` (client)
  - AC4 — Steps 8, 9 — `helpers.test.ts`, `AgentPerformanceView.test.tsx` (client)
  - AC5 — Step 5 — NEW `server/test/agent-performance.it.test.ts` (it)
  - AC6 — Steps 2, 3 — `agent-performance.it.test.ts` (it); NEW `server/test/agent-performance-domain.test.ts` (hermetic)
  - AC7 — Steps 2, 3 — `agent-performance-domain.test.ts` (hermetic); `agent-performance.it.test.ts` (it)
  - AC8 — Step 2 — `agent-performance-domain.test.ts` (hermetic); `agent-performance.it.test.ts` (it)
  - AC9 — Steps 1, 2, 4, 5 — `agent-performance.it.test.ts` (it); `agent-performance-domain.test.ts` (hermetic)
  - AC10 — Step 2 — `agent-performance-domain.test.ts` (hermetic); `agent-performance.it.test.ts` (it)
  - AC11 — Steps 1, 2 — `agent-performance-domain.test.ts` (hermetic); `agent-performance.it.test.ts` (it)
  - AC12 — Step 2 — `agent-performance-domain.test.ts` (hermetic); `agent-performance.it.test.ts` (it)
  - AC13 — Steps 7, 10, 11 — `AgentPerformanceView.test.tsx` (client)
  - AC14 — Steps 8, 11 — `helpers.test.ts`, `AgentPerformanceView.test.tsx` (client)
  - AC15 — Steps 9, 10, 11 — `AgentPerformanceView.test.tsx` (client)
  - AC16 — Steps 6, 9 — `AgentPerformanceView.test.tsx` (client)
  - AC17 — Steps 2, 9 — `AgentPerformanceView.test.tsx` (client); `agent-performance.it.test.ts` (`has_any_runs`, it)
  - AC18 — Steps 2, 11 — `AgentPerformanceView.test.tsx` (client); `agent-performance-domain.test.ts` (hermetic)
  - AC19 — Steps 7, 10, 11 — `AgentPerformanceView.test.tsx` (client)
  - AC20 — Steps 3, 4, 6, 11 — `agent-performance.it.test.ts` (it); `AgentPerformanceView.test.tsx` (client)
  - AC21 — Steps 2, 11 — `AgentPerformanceView.test.tsx` (client)
  - AC22 — Step 2 — `agent-performance-domain.test.ts` (hermetic); `agent-performance.it.test.ts` (it)
  - AC23 — Steps 8, 10, 11 — `helpers.test.ts`, `AgentPerformanceView.test.tsx` (client)
  - ECs and NFRs without their own row are traced in §5.

## 2. Applicable constraints
- INSIGHTS entries:
  - root — "The implementer cannot apply a plan-sanctioned vendor edit". `nav.ts` and `nav.test.tsx` are Step 12, owned by the main session.
  - root — "Agent path-guard hooks resolve paths against the session cwd". The main session stays at the repo root before it spawns any writer.
  - root — "`pnpm <script>` fails via corepack". Run bins as `./node_modules/.bin/<bin>`. No new dependency is needed (`recharts` is already a client dependency).
  - root — "A contract field added to RunStats must be optional, not just nullable". **Does not apply**: `AgentPerf` and `AgentStats` are fresh responses, never parsed from stored JSON. Fields follow the spec's nullability: plain for not-null, `.nullable()` for always-present-but-null, `.nullish()` only for `PerfCostSegment.agent_id` (spec line 258).
  - root — "A PR-list rollup taken from the LATEST review…". Considered and overridden by spec EC17 (§0 gap 4).
  - server — "PriceBook.estimate returns a different price on the first call after boot". Read-time re-pricing can differ between two calls. AC9 parity holds because both endpoints run the same reducer over the same rows within one request each. The IT tests inject `MockSecretsProvider` with no key, so `PriceBook` never fetches live prices and the static fallback is stable.
  - server — "The static pricing table shipped fabricated prices…". An unpriced slug resolves to null and counts in `unpriced_runs` (EC7); never 0.
  - server — "A per-route `rateLimit` never fires under NODE_ENV=test". NFR2 adds no per-route limit; the global 120/min (`server/src/app.ts:110-112`) is untouched.
  - server — "dependency-cruiser's `--ignore-known` baseline is already stale…". `check-changed.sh` tolerates exactly the 8 known cycles (`.claude/scripts/check-changed.sh:33-41`); the new module must add none.
  - server — "A module's ports.ts importing the repo-intel/index.js barrel adds no-circular violations". `agent-performance/ports.ts` imports only `./domain.js` types and `type`s from `@devdigest/shared`.
  - server — "`reviews.it.test.ts` and the conventions rescan test fail on a clean HEAD" and "Run-driven IT tests flake…". Re-run those on a clean worktree before blaming this change.
  - client — "Formatting a cost at fixed 4dp reports cheap real runs as free". Every money value uses `formatCost` (`client/src/components/run-cost-badge/helpers.ts:22-28`, exported at `index.ts:2`): "—" / "$0.00" / "<$0.0001" (EC15).
  - client — "A `<AppShell>`-wrapped page view needs `@/components/app-shell` mocked". The view test mocks the whole module (pattern `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/ConventionsView.test.tsx:12-14`).
  - client — "`@testing-library/user-event` is not installed". Tests use `fireEvent`, `el.focus()` and `toHaveFocus()`.
  - client — "Nested `_components/` drift". The new view follows the skill rule: nested children share the parent's `styles.ts`/`constants.ts`/`helpers.ts` and have a named-only `index.ts` (`frontend-ui-architecture/references/this-repo.md` "Nested `_components/`").
  - client — "The `Icon`/`IconName` registry…". The nav icon is `Gauge` (`client/src/vendor/ui/icons.tsx:58,141`); the trend arrows use `ArrowUp`/`ArrowDown` (`:37-38,119-120`).
  - client — "`MonoLink` with no `href` renders a <button>". The View link is `next/link` with an `href`; the deleted-agent row renders no link.
- Architecture / AGENTS.md rules:
  - Contract change edits both vendored copies identically (root `AGENTS.md` "Conventions"). The Agent Performance block of `productionize.ts` (`:134-189`) and the Per-agent Stats block of `observability.ts` (`:88-120`) are identical across copies today, and stay identical.
  - `@devdigest/shared` is type-only in the client: `import type` only.
  - Onion (`onion-architecture/SKILL.md` "Rule block"): routes → service → ports/domain ← repository. Only `container.ts` runs `new`. The service gets a narrow deps object, never `Container`.
  - depcruise rules (`server/.dependency-cruiser.cjs:27-88`):
    - `core-zod-type-only`: no runtime zod in `domain.ts` / `ports.ts`; the period query schema lives in `routes.ts`;
    - `application-no-infrastructure`: `service.ts` and `constants.ts` import no drizzle and no `src/db`;
    - `routes-no-data-access`: the routes call the service only;
    - `no-cross-module-internals`: no import from `modules/agents/**` or `modules/reviews/**`; the new repository reads `agents`, `agent_runs`, `reviews` and `findings` itself.
  - Why a new module and not `agents/`: `AgentsService` is built with the whole `Container` (`server/src/modules/agents/routes.ts:72`), a baselined violation. Extending it would grow that pattern (`onion-architecture/SKILL.md` Decision 4). A separate module registers `/agents/performance` and `/agents/:id/stats` itself; Fastify ranks the static `performance` segment above `:id` (see §7).
  - Server tests: DB tests are `*.it.test.ts`; hermetic tests never import `test/helpers/pg.ts` (root `AGENTS.md`).
  - Client: `data-<thing>` hooks (never `data-testid`); strings in `client/messages/en/agentPerformance.json` (and `shell.json` for the nav label, already present at `:27`); inline `s` styles, colours only as CSS variables; component folder layout per `client/AGENTS.md`.
  - `useSearchParams` in a client page needs a Suspense boundary; the root layout already provides one (`client/src/app/layout.tsx:29-31`).
- Do-not-touch items near this change:
  - `server/src/modules/agents/**`, `server/src/modules/reviews/**`, `server/src/platform/run-cost.ts`, `server/src/platform/price-book.ts`;
  - `server/src/db/schema/**`, `server/src/db/migrations/**`, `server/src/db/seed*.ts`;
  - `client/src/vendor/ui/**` except `nav.ts` (Step 12, main session); `client/src/vendor/shared/**` except the two contract files in Step 1;
  - `client/src/components/app-shell/helpers.ts` (already maps `/agent-performance`, `:37`); `client/messages/en/shell.json` (label exists, `:27`);
  - `client/src/components/run-cost-badge/**` (reused, not changed);
  - `server/clones/**`, lockfiles, `specs/**`.

## 3. Skill assignments
| Step | Skills the executing agent must read | Rules from the skill that shape this step |
|---|---|---|
| 1 | `zod` | PascalCase const plus same-named type ("type-export-schemas-and-types"). `.nullable()` for always-present-null vs `.nullish()` ("object-optional-vs-nullable", with the root `AGENTS.md` mapping). Enums for fixed values ("schema-use-enums") (`zod/SKILL.md`) |
| 2 | `onion-architecture` | `domain.ts` holds pure rules and imports no fastify, drizzle, SDK, `container` or runtime zod (`onion-architecture/SKILL.md` "The files of a module"). Domain errors subclass `AppError`. Platform shared kernel (`run-cost.ts`) is usable from any ring (`references/layers.md` "The rings") |
| 3 | `onion-architecture`, `drizzle-orm-patterns`, `security` | Ports are owned by the consumer and speak domain types, never `$inferSelect` (`references/layers.md` "Ports"). Rows → domain mapping in the repository (`references/layers.md` "Mapping"). Fetch only needed columns with `.where()` (`drizzle-orm-patterns/SKILL.md` "Best Practices" 8). Untrusted `from`/`to` reach SQL only as bound parameters (`security/SKILL.md` A05) |
| 4 | `onion-architecture`, `security` | Narrow deps object, never `Container` (`onion-architecture/SKILL.md` Workflow "Create" 3). Errors only through the `AppError` taxonomy (Checklist HIGH). Logs carry no user content (`security/SKILL.md` A09) |
| 5 | `onion-architecture`, `fastify-best-practices`, `zod`, `security` | Routes call the service only (CRITICAL). Schema-first querystring and response (`fastify-best-practices/SKILL.md` "Core Principles"). Validate at the boundary (`zod/SKILL.md` "parse-validate-early"). Reject malformed and oversized ranges (`security/SKILL.md` A06). One import plus one entry in `modules/index.ts` |
| 6 | `frontend-ui-architecture`, `react-best-practices` | One data path `lib/api.ts` → `lib/hooks/*` → component (`frontend-ui-architecture/references/this-repo.md` "One data path"). Server data stays in React Query (`frontend-ui-architecture/SKILL.md` "Where business logic lives") |
| 7 | `frontend-ui-architecture` | One namespace file, camelCase keys nested by surface, no inline strings (`references/this-repo.md` "i18n") |
| 8 | `frontend-ui-architecture`, `react-best-practices` | Domain rules as plain functions in `helpers.ts`, no React import (`frontend-ui-architecture/SKILL.md` "Where business logic lives"). Business rules never inside JSX ("Anti-patterns") |
| 9 | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices` | Thin `page.tsx`, view under `_components/` (`references/this-repo.md` "Route-level files"). URL state in search params (`react-best-practices/SKILL.md` "State Hygiene"). Errors linked with `aria-describedby`/`aria-invalid` ("Accessibility"). `useSearchParams` needs Suspense (`next-best-practices/suspense-boundaries.md`), already given by the root layout. Early returns for loading/error/empty ("Conditional Rendering") |
| 10 | `frontend-ui-architecture`, `react-best-practices`, `security` | Nested children share the parent's styles/helpers, named-only `index.ts` (`references/this-repo.md`). Derive, don't store (`react-best-practices/SKILL.md`). Agent names and model slugs render as text only, no `dangerouslySetInnerHTML` (`security/SKILL.md` A05 "XSS") |
| 11 | `frontend-ui-architecture`, `react-best-practices`, `security` | A stateful child gets a folder (`references/this-repo.md` "bare-file escape hatch"). Stable keys, not indexes (`react-best-practices/SKILL.md` "Key Prop Patterns"). `aria-expanded`/`aria-sort`, icon buttons named ("Accessibility"). Names as text (`security/SKILL.md` A05) |
| 12 | `frontend-ui-architecture` | Vendored copy: main session only (root INSIGHTS). Test hooks and labels match `shell:nav.*` |
| Tests | `onion-architecture` (`references/testing.md`), `react-testing-library`, `spec-writing` (`references/ears.md` "Verify by") | Domain tests need no mocks; service tests use fakes of ports; `*.it.test.ts` for pg (`references/testing.md`). RTL: query by role and accessible name first, test behaviour (`react-testing-library/SKILL.md` "Query Priority", "What to Test") |

## 4. Steps

### Step 1 — Extend the Agent Performance and Agent Stats contracts in both vendored shared copies  (package: server + client vendored shared)
- Covers: AC9 (parity fields), AC11 (segment `kind`), AC17 (`has_any_runs`), AC19 (`cost_basis`), AC21 (row `cost_by_model`), AC22 (`period`, previous fields, `runs_series`), NFR4, NFR7; prerequisite of Steps 2–11
- Files:
  - `server/src/vendor/shared/contracts/observability.ts`;
  - `client/src/vendor/shared/contracts/observability.ts`;
  - `server/src/vendor/shared/contracts/productionize.ts`;
  - `client/src/vendor/shared/contracts/productionize.ts`;
  - `client/src/lib/types.ts`.
- Context:
  - `AgentStats` is at `observability.ts:96-119` in both copies; `StatPoint` at `:93-94`; the block runs from `// Per-agent Stats (GET /agents/:id/stats)` (`:89`) to `// Cross-session memory curator` (`:122`).
  - `AgentPerfRow` `:139-164`, `PerfCostSegment` `:167-171`, `AgentPerf` `:174-186` in both `productionize.ts` copies; the block runs from `// Agent Performance  (GET /agents/performance)` (`:135`) to `// re-export Severity-adjacent helper` (`:188`). Header imports: `productionize.ts:1-2` (`z`, `Severity`), `observability.ts:1-2`.
  - No runtime or type consumer exists outside the four files (grep for `AgentPerf|AgentStats|PerfCostSegment`).
  - Both barrels re-export the two files (`server/src/vendor/shared/index.ts:25-26`, same in the client).
  - `client/src/lib/types.ts:40-43` is the type re-export list.
- Change:
  - `observability.ts` (both copies), inside the Per-agent Stats block, before `AgentStats`:
    - `PerfPeriod = z.object({ from: z.string(), to: z.string(), previous_from: z.string(), previous_to: z.string() })` plus its type.
    - `AgentStats` keeps every field. Add: `period: PerfPeriod`, `decided: z.number().int()`, `unpriced_runs: z.number().int()`, `last_run_at: z.string().nullable()`, `cost_basis: z.literal('estimate')`.
  - `productionize.ts` (both copies): add `import { PerfPeriod } from './observability.js';` after `:2`, identically in both. Inside the Agent Performance block:
    - `PerfSeriesPoint = z.object({ label: z.string(), value: z.number().int() })`.
    - `PerfCostSegmentKind = z.enum(['agent', 'deleted_agent', 'model', 'unknown_model'])`.
    - `PerfCostSegment = { label: z.string().nullable(), value: z.number(), kind: PerfCostSegmentKind, agent_id: z.string().nullish() }`.
    - `PerfMostActive = { agent_id: z.string(), agent_name: z.string(), runs: int, accept_rate: z.number().nullable(), decided: int }`.
    - `AgentPerfRow`:
      - `agent_id` and `agent_name` become `.nullable()`;
      - add `pending`, `decided`, `unpriced_runs`, `previous_decided` (int), `previous_accept_rate` (`.nullable()`), `cost_by_model: z.array(PerfCostSegment)`;
      - every other field stays as is.
    - `AgentPerf`:
      - add `period: PerfPeriod` and `cost_basis: z.literal('estimate')`;
      - `summary` adds `has_any_runs: z.boolean()`, `previous_total_cost_usd: z.number().nullable()`, `unpriced_runs`, `accepted`, `decided` (int), `most_active: PerfMostActive.nullable()`, `runs_series: z.array(PerfSeriesPoint)`. Existing summary fields stay.
    - Update the comments: `accept_rate` = accepted / decided; `cost_by_agent`/`cost_by_model` sorted by value descending and summing to `summary.total_cost_usd`.
  - `client/src/lib/types.ts`: add `export type { AgentPerf, AgentPerfRow, PerfCostSegment, PerfCostSegmentKind, PerfPeriod, PerfMostActive, PerfSeriesPoint, AgentStats } from "@devdigest/shared";`.
- Skills: `zod` — as in §3.
- Done when: the two Per-agent Stats blocks and the two Agent Performance blocks are byte-identical, and so are the two `productionize.ts` import lines; `.claude/scripts/check-changed.sh server client` passes.
- Depends on: none
- Agent: implementer — Phase: 1

### Step 2 — Module constants and the pure aggregation (one reducer for both endpoints)  (package: server)
- Covers: AC6 (window split), AC7, AC8, AC9 (shared reducer), AC10, AC11, AC12, AC17 (`has_any_runs` passthrough), AC18 (rows without runs), AC21 (row data), AC22, NFR4; EC4, EC6, EC7, EC8, EC9, EC10, EC11, EC17, EC20, EC21; §0 gaps 1 and 3
- Files:
  - `NEW server/src/modules/agent-performance/constants.ts`;
  - `NEW server/src/modules/agent-performance/domain.ts`.
- Context:
  - `CostEstimator` type is at `server/src/platform/run-cost.ts:12`; `resolveRunCost(estimate, run)` at `:27` (persisted cost, else tokens × price, else null; zero tokens → null).
  - `agent_runs` columns: `server/src/db/schema/runs.ts:8-33` (`ranAt` `:15`, `model` `:17`, `durationMs` `:18`, `tokensIn/Out` `:19-20`, `costUsd` `:22`, `status` `:23`).
  - Finding severities are `CRITICAL | WARNING | SUGGESTION` (`server/src/vendor/shared/contracts/productionize.ts:156-160`).
  - `AppError` is at `server/src/platform/errors.ts:7-17`.
  - Pattern for a pure domain file: `server/src/modules/brief/domain.ts`.
- Change:
  - `constants.ts`:
    - `FINISHED_RUN_STATUSES = ['done', 'failed', 'cancelled'] as const`;
    - `MAX_PERIOD_MS = 366 * 24 * 60 * 60 * 1000`;
    - `HOURLY_BUCKET_MAX_MS = 48 * 60 * 60 * 1000`;
    - `HOUR_MS`, `DAY_MS`;
    - `TREND_RUNS = 10`.
  - `domain.ts` types:
    - `Period { from: Date; to: Date }`;
    - `PerfAgent { id; name; provider: string | null; model: string | null }`;
    - `PerfRun { id; agentId: string | null; ranAt: Date; model: string | null; durationMs: number | null; tokensIn: number | null; tokensOut: number | null; costUsd: number | null; status: 'done' | 'failed' | 'cancelled' }`;
    - `PerfRunFindings { runId; severity: string; total: number; accepted: number; dismissed: number }`.
  - `domain.ts` functions:
    - `previousPeriod(p: Period): Period` → `[from − (to − from), from)`.
    - `bucketSizeMs(p)` → `HOUR_MS` when `to − from ≤ HOURLY_BUCKET_MAX_MS`, else `DAY_MS`.
    - `runsSeries(p, runs)`: `ceil((to − from) / size)` buckets aligned to `from`. Each current run goes to bucket `floor((ranAt − from) / size)`. Labels are bucket-start ISO strings, oldest first. The sum equals the current run count (AC22, EC21).
    - `aggregateAgent(runs, findingsByRun, estimate)`: the single per-agent reducer, used by both outputs (AC9). It returns:
      - `runs`;
      - `findings_total`, `accepted`, `dismissed`, `decided = accepted + dismissed`, `pending = findings_total − decided`;
      - `accept_rate = decided ? accepted / decided : null` (AC7); `dismiss_rate` likewise; `avg_findings_per_run`;
      - `total_cost_usd`: the sum of non-null `resolveRunCost`, or null when none is priced (AC10); `unpriced_runs`; `avg_cost_usd = total / priced runs`, or null;
      - `avg_latency_ms`: the mean `durationMs` of `done` runs with a duration, or null (EC6);
      - `last_run_at`: the max `ranAt` as ISO, or null;
      - `findings_by_severity`;
      - `cost_by_model`: priced runs grouped by model (null model → `kind: 'unknown_model'`, `label: null`), sorted by value descending;
      - `trend`: the findings counts of the last `TREND_RUNS` runs, oldest first (§0 gap 1).
    - `buildAgentPerformance({ period, agents, runs, findings, hasAnyRuns, estimate }): AgentPerf`.
      - Split runs into current (`from ≤ ranAt < to`) and previous (`previous.from ≤ ranAt < from`), half-open (AC6, EC11).
      - Group by `agentId`. A null `agentId`, or an id not in `agents`, goes to the deleted bucket (EC8).
      - One row per existing agent (enabled or not). Agents without current runs get `runs: 0`, null rates and costs, `last_run_at: null` and empty `cost_by_model` (AC18). The deleted bucket gets a row only when it has current runs: `agent_id: null`, `agent_name: null`, `provider: null`, `model: null`.
      - `previous_accept_rate` and `previous_decided` come from `aggregateAgent` over the previous runs (AC22).
      - Row order follows §0 gap 3.
      - Summary:
        - `runs`; `has_any_runs`;
        - `total_cost_usd` (all current runs, deleted bucket included); `previous_total_cost_usd`; `unpriced_runs`;
        - `accepted`, `decided`, `avg_accept_rate = Σaccepted / Σdecided`, or null (AC8, pooled);
        - `most_active`: existing agents only; most runs, then latest `last_run_at`, then name ascending; null when no existing agent has a current run (AC12, EC8, EC10). `most_active_agent` is its name or null;
        - `runs_series`.
      - `cost_by_agent`: one segment per row with a non-null `total_cost_usd` (`kind: 'agent'` with `agent_id` and the name as label, or `'deleted_agent'` with `label: null`), sorted by value descending. `cost_by_model` is over all current priced runs. Both sum to `summary.total_cost_usd`; both are `[]` when the total is null (AC11).
      - `period` holds the four ISO strings; `cost_basis: 'estimate'`.
      - No finding text, title, rationale, prompt or diff is ever read or emitted (NFR4).
    - `buildAgentStats({ period, agent, runs, findings, estimate }): AgentStats` → `aggregateAgent` over the current runs, plus `agent_id`, `agent_name`, `trend` as `StatPoint`s, `period`, `cost_basis`.
    - `class AggregationFailedError extends AppError` with `('internal_error', 'Agent performance aggregation failed', 500)`, used by Step 4.
- Skills: `onion-architecture` — as in §3.
- Done when: `tsc --noEmit` passes; the onion gate shows no new violation. `domain.ts` imports only `type`s from `@devdigest/shared`, `../../platform/run-cost.js`, `../../platform/errors.js` and `./constants.js`.
- Depends on: 1
- Agent: implementer — Phase: 2

### Step 3 — Ports and read-only repository  (package: server)
- Covers: AC6 (status and window filter), AC7 (decision counts per run), AC17 (`hasAnyFinishedRun`), AC20/NFR3 (read-only by construction), untrusted `from`/`to` (bound parameters); §0 gap 2
- Files:
  - `NEW server/src/modules/agent-performance/ports.ts`;
  - `NEW server/src/modules/agent-performance/repository.ts`.
- Context:
  - Pattern: `server/src/modules/blast/ports.ts:1-22` and `server/src/modules/blast/repository.ts:1-22` (`class … implements …Port`, `constructor(private readonly db: Db)`, `import * as t from '../../db/schema.js'`, `import type { Db } from '../../db/client.js'`).
  - Tables:
    - `t.agents` (`server/src/db/schema/agents.ts:8-36`: `workspaceId` `:10`, `name` `:13`, `provider` `:15`, `model` `:16`, `createdAt` `:35`);
    - `t.agentRuns` (`runs.ts:8-33`, `workspaceId` `:10`, `agentId` `:13`);
    - `t.reviews` (`reviews.ts:10-27`, `workspaceId` `:12`, `runId` `:20`);
    - `t.findings` (`reviews.ts:29-47`, `reviewId` `:31`, `severity` `:37`, `acceptedAt` `:45`, `dismissedAt` `:46`).
  - Accept and dismiss are mutually exclusive (`server/src/modules/reviews/repository/review.repo.ts:121-145`).
- Change:
  - `ports.ts`:
    - `AgentPerformanceRepositoryPort`:
      - `listAgents(ws): Promise<PerfAgent[]>`;
      - `findAgent(ws, agentId): Promise<PerfAgent | null>`;
      - `listFinishedRuns(ws, window: Period, agentId?: string): Promise<PerfRun[]>`;
      - `countFindingsByRun(ws, window: Period, agentId?: string): Promise<PerfRunFindings[]>`;
      - `hasAnyFinishedRun(ws): Promise<boolean>`.
    - `PerfLogger { error(obj: unknown, msg?: string): void }`.
    - Read methods only; no method writes.
  - `repository.ts` (`AgentPerformanceRepository`):
    - `listAgents` / `findAgent`: workspace-scoped `select` of `id`, `name`, `provider`, `model`.
    - `listFinishedRuns`: `select` of only the `PerfRun` columns. Where:
      - `eq(workspaceId, ws)`;
      - `gte(ranAt, window.from)` and `lt(ranAt, window.to)`;
      - `inArray(status, FINISHED_RUN_STATUSES)`;
      - `eq(agentId, id)` when an `agentId` is given.

      Rows are mapped to `PerfRun`.
    - `countFindingsByRun`: `t.findings` inner-joined to `t.reviews` (`findings.reviewId = reviews.id`), inner-joined to `t.agentRuns` (`reviews.runId = agentRuns.id`).
      - Same run filters as above, plus `eq(reviews.workspaceId, ws)`.
      - `groupBy(reviews.runId, findings.severity)`.
      - Columns: `count(*)::int`, `count(*) filter (where accepted_at is not null)::int`, `count(*) filter (where dismissed_at is not null and accepted_at is null)::int`.
    - `hasAnyFinishedRun`: `select 1 … limit 1` with `workspaceId` and status in `FINISHED_RUN_STATUSES`.
    - `from` and `to` are passed only as `Date` values through drizzle operators, never interpolated into raw SQL.
- Skills: `onion-architecture`, `drizzle-orm-patterns`, `security`.
- Done when: `tsc --noEmit` passes; the onion gate shows no new violation (only the 8 known cycles); `ports.ts` has no runtime import.
- Depends on: 2
- Agent: implementer — Phase: 2

### Step 4 — AgentPerformanceService: dashboard and per-agent stats, failure log  (package: server)
- Covers: AC9 (both paths through one reducer), AC20 / NFR3 (no write, no LLM), NFR8, EC12 (server side of a crafted URL is in Step 5)
- Files: `NEW server/src/modules/agent-performance/service.ts`
- Context:
  - Deps-object pattern: `server/src/modules/blast/service.ts:6-13`.
  - `NotFoundError('…')` is at `server/src/platform/errors.ts:19-22`.
  - Unknown errors are logged a second time by the global handler (`server/src/app.ts:174`), while an `AppError` is sent without logging (`:168-173`). That is why the service rethrows `AggregationFailedError` (an `AppError`), so NFR8's single error line holds.
- Change:
  - `AgentPerformanceDeps { repo: AgentPerformanceRepositoryPort; estimateCost: CostEstimator }`.
  - `performance(ws, period: Period, ctx: { logger?: PerfLogger } = {}): Promise<AgentPerf>`:
    - computes `previous = previousPeriod(period)`;
    - in `Promise.all`: `listAgents(ws)`, `listFinishedRuns(ws, { from: previous.from, to: period.to })`, `countFindingsByRun` over the same window, and `hasAnyFinishedRun(ws)`;
    - returns `buildAgentPerformance(...)`.
  - `agentStats(ws, agentId, period, ctx)`:
    - `findAgent`, or `NotFoundError('Agent not found')`;
    - the same two reads filtered by `agentId` over the current period only;
    - returns `buildAgentStats(...)`.
  - Both methods wrap the reads and the aggregation (not the `NotFoundError`) in `try/catch`. On an unexpected error they call `ctx.logger?.error({ event: 'agent_performance.failed', route, from: period.from.toISOString(), to: period.to.toISOString() }, 'agent_performance.failed')` once and throw `new AggregationFailedError()`.
    - `route` is the literal `'GET /agents/performance'` or `'GET /agents/:id/stats'`.
    - The log never contains agent names, model slugs or the error's message text (NFR8).
  - The service has no LLM, GitHub or job dependency and calls no write port (AC20).
- Skills: `onion-architecture`, `security`.
- Done when: `tsc --noEmit` passes; depcruise is clean. `service.ts` imports only `type`s, `./ports.js`, `./domain.js` and `../../platform/{errors,run-cost}.js`.
- Depends on: 3
- Agent: implementer — Phase: 2

### Step 5 — Routes, period validation, container wiring, registry  (package: server)
- Covers: AC5, AC9 (same query rules on both routes), AC20 (GET only), NFR2 (no per-route limit), NFR4 (response schema), EC12 (crafted URL → 422), untrusted `from`/`to`
- Files:
  - `NEW server/src/modules/agent-performance/routes.ts`;
  - `server/src/modules/index.ts`;
  - `server/src/platform/container.ts`.
- Context:
  - Route pattern: `server/src/modules/blast/routes.ts:11-24` (`const service = container.blastService;`, `getContext(container, req)`).
  - `getContext(container, req): Promise<RequestContext>` is at `server/src/modules/_shared/context.ts:14`; `IdParams = z.object({ id: z.string().uuid() })` at `server/src/modules/_shared/schemas.ts:11`.
  - Querystring schema precedent: `server/src/modules/project-context/routes.ts:50`.
  - Validation errors from the zod type provider become 422 `validation_error` (`server/src/app.ts:131-142`).
  - Registry: `server/src/modules/index.ts:1-49` (imports `:2-17`, map `:32-49`).
  - Memoized getter pattern: `container.ts:233-240`. Private fields are at `:111-132`, module imports at `:34-53`. `get priceBook(): PriceBook` is at `:359-370`, and `PriceBook.estimate(model, tokensIn, tokensOut): number | null` at `server/src/platform/price-book.ts:34`.
  - The existing `/agents/:id` route lives in another plugin (`server/src/modules/agents/routes.ts:79`).
- Change:
  - `routes.ts`, `export default async function agentPerformanceRoutes`:
    - `PeriodQuery = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).superRefine(...)`. It adds an issue on `to` when `Date.parse(from) >= Date.parse(to)` or `to − from > MAX_PERIOD_MS`.
    - `GET /agents/performance` with `{ querystring: PeriodQuery, response: { 200: AgentPerf } }` → `service.performance(ws, toPeriod(req.query), { logger: req.log })`.
    - `GET /agents/:id/stats` with `{ params: IdParams, querystring: PeriodQuery, response: { 200: AgentStats } }` → `service.agentStats(ws, req.params.id, period, { logger: req.log })`.
    - No `config.rateLimit` (NFR2). `toPeriod` converts the two strings to `Date`.
  - Container:
    - `import { AgentPerformanceRepository } from '../modules/agent-performance/repository.js'` and `import { AgentPerformanceService } from '../modules/agent-performance/service.js'`;
    - `private _agentPerformanceService?: AgentPerformanceService`;
    - `get agentPerformanceService()` builds `new AgentPerformanceService({ repo: new AgentPerformanceRepository(this.db), estimateCost: (m, i, o) => this.priceBook.estimate(m, i, o) })`, memoized with `??=`.
  - Registry: `import agentPerformance from './agent-performance/routes.js';` and the entry `agentPerformance`.
- Skills: `onion-architecture`, `fastify-best-practices`, `zod`, `security`.
- Done when: `.claude/scripts/check-changed.sh server --full` passes (only the 8 known cycles); in dev, `GET /agents/performance?from=…&to=…` returns 200, not a 422 from `/agents/:id`.
- Depends on: 4
- Agent: implementer — Phase: 2

### Step 6 — Client data hook  (package: client)
- Covers: AC2 (one GET with `from`/`to`), AC16 (error surfaces), AC20 (GET only), EC13 (query keyed by period), NFR2
- Files:
  - `NEW client/src/lib/hooks/agent-performance.ts`;
  - `client/src/lib/hooks/index.ts`.
- Context:
  - Pattern: `client/src/lib/hooks/blast.ts:1-16` (`useQuery`, `api.get<T>`, `retry: false`).
  - `api.get` is at `client/src/lib/api.ts:66`; `ApiError` at `:8-19`.
  - Barrel: `client/src/lib/hooks/index.ts:4-14`.
  - Query defaults (`retry: 1`, `staleTime: 30_000`) are in `client/src/lib/providers.tsx` (`frontend-ui-architecture/references/this-repo.md` "One data path").
- Change:
  - `"use client"`.
  - `agentPerformanceKey(period: { from: string; to: string })` → `["agent-performance", from, to]`.
  - `agentPerformancePath(period)` → `` `/agents/performance?${new URLSearchParams({ from, to })}` ``.
  - `useAgentPerformance(period)` → `useQuery({ queryKey, queryFn: () => api.get<AgentPerf>(path), retry: false })`. No `placeholderData`/`keepPreviousData`, so a new period never shows the previous period's numbers (EC13).
  - `import type` only; add `export * from "./agent-performance";` to the barrel.
- Skills: `frontend-ui-architecture`, `react-best-practices`.
- Done when: `.claude/scripts/check-changed.sh client` passes.
- Depends on: 1
- Agent: implementer — Phase: 3

### Step 7 — i18n namespace `agentPerformance`  (package: client)
- Covers: AC4 (error texts), AC13 ("N decisions"), AC14 (badge text), AC16 (`loadError`), AC17 (two empty states), AC18 ("No runs in period"), AC19 (Estimated label and explanation), AC23 (arrow and delta text), NFR5 (text alternatives), NFR6
- Files: `client/messages/en/agentPerformance.json`
- Context: the current keys are at `client/messages/en/agentPerformance.json:1-32`. No code uses the namespace (grep `agentPerformance` in `client/src`). Namespace files are picked up automatically (root `AGENTS.md` "i18n").
- Change:
  - Keep `title` and `loadError`.
  - Replace `subtitle` with "Which agents earn their keep — accept rate is the quality signal" (NFR6, design wording).
  - Remove the unused `sort.*`, `costByAgent`, `costByModel`, `noCost`, `perAgent`, `summary.*`, `table.findings|cost|trend` and `empty.*`.
  - Add:
    - `crumb`;
    - `period.{label, oneDay, thirtyDays, custom, start, end, apply, errors.{startAfterEnd, endInFuture, tooLong, invalid}}`;
    - `kpi.{totalRuns, totalCost, avgAcceptRate, mostActive, runsSeriesAlt ("{count} runs, by {unit}"), unitHour, unitDay, acceptRingAlt ("{percent} accept rate"), mostActiveDetail ("{runs} runs · {rate} accept"), costDelta ("{amount} vs previous period"), costDeltaUp, costDeltaDown}`;
    - `decisions` ("{count, plural, one {# decision} other {# decisions}}");
    - `estimate.{label ("Estimated"), explanation ("Costs are DevDigest estimates computed from token counts and a price table, not reconciled billing data.")}`;
    - `table.{agent, runs, avgCost, avgDuration, accept, lastRun, view, viewAgent ("Open {name}"), expand ("Show details for {name}"), collapse ("Hide details for {name}"), noRunsInPeriod ("No runs in period"), smallSample ("Small sample (n={count})"), trendUp ("Accept rate up vs previous period"), trendDown ("Accept rate down vs previous period"), deletedAgent ("Deleted agent")}`;
    - `details.{severity, critical, warning, suggestion, accepted, dismissed, pending, costByModel, noCost}`;
    - `breakdown.{title ("Cost breakdown"), byAgent ("By agent"), byModel ("By model"), legendItem ("{label}: {amount} ({percent})"), unknownModel ("Unknown model"), noCost}`;
    - `empty.{noRunsTitle ("No agent runs yet"), noRunsBody, noRunsInPeriodTitle ("No runs in this period"), noRunsInPeriodBody ("Try a wider period, such as the last 30 days or a custom range.")}`.
  - Keys are camelCase, nested by surface.
- Skills: `frontend-ui-architecture`.
- Done when: the JSON is valid and every key used in Steps 9–11 exists.
- Depends on: none
- Agent: implementer — Phase: 3

### Step 8 — View constants and pure helpers (period, sort, trend, formatting)  (package: client)
- Covers: AC2 (period → query), AC3 (parse URL, 30-day fallback), AC4 (custom range validation), AC14 (sort with threshold), AC23 (delta and trend rules), EC12, EC15, NFR5 (percent text for legends)
- Files, all NEW, under `client/src/app/agent-performance/_components/AgentPerformanceView/`:
  - `constants.ts`;
  - `helpers.ts`.
- Context:
  - `formatCost` comes from `@/components/run-cost-badge` (`client/src/components/run-cost-badge/index.ts:2`; rules at `helpers.ts:22-28`).
  - Relative-time precedent to copy (not import): `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/helpers.ts:4-19`.
  - Server limit mirrored: `MAX_PERIOD_MS` (Step 2).
- Change:
  - `constants.ts`:
    - `SMALL_SAMPLE_THRESHOLD = 10`;
    - `DEFAULT_RANGE = "30d"`;
    - `RANGES = ["1d", "30d", "custom"] as const`;
    - `MAX_CUSTOM_DAYS = 365`;
    - `MAX_PERIOD_MS = 366 * 24 * 3600 * 1000`;
    - `SKELETON_ROWS = 5`;
    - `DONUT_COLORS`: CSS variables only, for example `"var(--accent)"`, `"var(--ok)"`, `"var(--warn)"`, `"var(--crit)"`, `"var(--text-muted)"`. Verify the names against `client/src/vendor/ui/styles.css` before use.
  - `helpers.ts`, pure functions with no React import:
    - `type Range = "1d" | "30d" | "custom"`; `type UiPeriod = { from: string; to: string; range: Range }`.
    - `presetPeriod(range: "1d" | "30d", nowMs)`: `to = now`, `from = now − 24 h` or `30 × 24 h`, as ISO.
    - `parsePeriodQuery(params: URLSearchParams): UiPeriod | null`:
      - valid only if `from`/`to` parse, `from < to` and `to − from ≤ MAX_PERIOD_MS`;
      - an unknown `range` becomes `"custom"` (AC3, EC12).
    - `periodToSearch(p): string` → `from`, `to`, `range`.
    - `customRangeToPeriod(startDate: string, endDate: string, now: Date): { period: UiPeriod } | { error: "invalid" | "startAfterEnd" | "endInFuture" | "tooLong" }`:
      - `from` = local midnight of the start day; `to` = local midnight of the day after the end day (both days included);
      - errors: end after today → `endInFuture`; start > end → `startAfterEnd`; more than 365 inclusive days → `tooLong` (AC4).
    - `periodToDateInputs(p)` → local `YYYY-MM-DD` start and end (end = the day of `to − 1 ms`), so the picker shows the same custom range after a reload (AC3).
    - `isSmallSample(decided)`.
    - `sortRows(rows, dir: "desc" | "asc")`, three groups in this order:
      1. rows with `runs > 0` and `decided ≥ 10`, by `accept_rate` in `dir`;
      2. rows with `runs > 0` and `decided < 10`, by `accept_rate` in `dir`, nulls last;
      3. rows with `runs = 0`, by name.

      Ties break by name. The deleted-agent row sorts by its label key (AC14, AC18).
    - `trendDirection(row): "up" | "down" | null`. Null unless `decided ≥ 10`, `previous_decided ≥ 10` and both rates are non-null. Compare `Math.round(rate × 100)`; equal → null (AC23).
    - `costDelta(summary): number | null`: non-null only when both totals are non-null (AC23).
    - `formatSignedCost(delta)`: a text sign plus `formatCost(|delta|)`, for example "−$1.20" or "+$0.30", so direction is never colour-only.
    - `formatPercent(rate | null)` → "—" or "75%".
    - `formatDuration(ms | null)` → "—", "850 ms" or "1.2 s".
    - `formatRelativeTime(iso)` (local copy).
    - `withPercents(segments)` → each segment's share of the sum as "NN%".
- Skills: `frontend-ui-architecture`, `react-best-practices`.
- Done when: `.claude/scripts/check-changed.sh client` passes.
- Depends on: 1
- Agent: implementer — Phase: 3

### Step 9 — Route page, view shell, period picker, loading / error / empty states  (package: client)
- Covers: AC2, AC3, AC4, AC15 (skeleton shell), AC16, AC17, EC1, EC2, EC12, EC13, EC14, EC19, NFR2 (one request on open), NFR5 (picker keyboard and labels), NFR6
- Files:
  - `NEW client/src/app/agent-performance/page.tsx`;
  - `NEW client/src/app/agent-performance/_components/AgentPerformanceView/{AgentPerformanceView.tsx,styles.ts,index.ts}`;
  - `NEW .../AgentPerformanceView/_components/PeriodPicker/{PeriodPicker.tsx,index.ts}`.
- Context:
  - Thin page pattern: `client/src/app/agents/page.tsx:1-7`.
  - View pattern with `AppShell` plus loading/error/empty: `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/ConventionsView.tsx:20-69` and `client/src/app/repos/[repoId]/pulls/page.tsx:27-44,107-131` (`useSearchParams`, `router.replace` with `URLSearchParams`).
  - `PageContainer({ title, subtitle, actions, children })` is at `client/src/components/page-shell/PageShell.tsx:13-38`.
  - Vendored primitives:
    - `Skeleton({ width, height })` (`client/src/vendor/ui/primitives/Skeleton.tsx:4-14`);
    - `ErrorState({ title, body, onRetry })` — renders `role="alert"` and a "Retry" button (`ErrorState.tsx:6-58`);
    - `EmptyState({ icon, title, body })` (`EmptyState.tsx:5-19`);
    - `Button` takes `kind`, `size`, `active` and any button attribute (`client/src/vendor/ui/primitives/tokens.ts:24-35`).
  - The root layout wraps pages in `Suspense` (`client/src/app/layout.tsx:29-31`).
- Change:
  - `page.tsx`: a header comment, then `export default function AgentPerformancePage() { return <AgentPerformanceView />; }`.
  - `AgentPerformanceView` (`"use client"`):
    - `const search = useSearchParams()`; `const [fallback] = useState(() => presetPeriod("30d", Date.now()))`; `period = parsePeriodQuery(search) ?? { ...fallback, range: "30d" }`. Stable across renders: one request on open, no URL write on load (AC3, NFR2).
    - `useAgentPerformance(period)`.
    - `selectPeriod(p)` → `router.replace("/agent-performance?" + periodToSearch(p))` (AC2).
    - Renders `<AppShell crumb={[{ label: t("crumb") }]}>` → `PageContainer` with `title`, `subtitle` and `actions={<PeriodPicker …/>}`, then the body by early return:
      - loading → skeletons for 4 KPI cards, `SKELETON_ROWS` table rows and 2 donuts, with no numbers (AC15);
      - error → `ErrorState title={t("loadError")} onRetry={() => refetch()}` and no metric (AC16);
      - `summary.runs === 0` → `EmptyState` with `empty.noRunsTitle`/`noRunsBody` when `!has_any_runs`, else `empty.noRunsInPeriodTitle`/`noRunsInPeriodBody` (AC17);
      - otherwise `KpiCards`, `PerfTable`, `CostBreakdown` (Steps 10, 11).
    - The root carries `data-agent-performance` and `data-state="loading|error|empty|ready"`.
  - `PeriodPicker({ period, onSelect })`:
    - "1 day" and "30 days" `Button`s with `aria-pressed`; a "Custom" toggle shows two labelled `<input type="date">` fields (`max` = today) and an Apply button.
    - Apply runs `customRangeToPeriod`. On error it shows `period.errors.*` in an element with an `id`, sets `aria-invalid` and `aria-describedby` on the inputs, and does not call `onSelect`, so no request is made (AC4).
    - The custom inputs are pre-filled from `periodToDateInputs(period)` when `range === "custom"`.
    - Every control is a native button or input, so keyboard and focus ring come from the global styles; never `outline: none` (NFR5). Attribute `data-period-picker`.
  - `styles.ts` holds one `export const s`, sectioned by child; colours are CSS variables only. `index.ts` exports named and default.
- Skills: `frontend-ui-architecture`, `next-best-practices`, `react-best-practices`.
- Done when: `.claude/scripts/check-changed.sh client` passes; in dev, `/agent-performance` renders and the URL updates on a period pick.
- Depends on: 6, 7, 8
- Agent: implementer — Phase: 3

### Step 10 — KPI cards and cost breakdown donuts  (package: client)
- Covers: AC13 (KPI denominator), AC15 (no numbers while loading — handled by Step 9's early return), AC19 (Estimated on Total cost, delta and both legends), AC23 (delta only when both totals are non-null), EC15, EC18 (all segments in the legend), EC20, NFR5 (ring, sparkline and legend text alternatives), untrusted model slugs and agent names
- Files, all NEW, under `.../AgentPerformanceView/_components/`:
  - `KpiCards/{KpiCards.tsx,index.ts}`;
  - `CostBreakdown/{CostBreakdown.tsx,index.ts}`;
  - `CostDonut/{CostDonut.tsx,index.ts}`.
- Context:
  - `Sparkline({ data: number[], color?, w?, h? })` is at `client/src/vendor/ui/charts/Sparkline.tsx:4-28` and returns null for empty data.
  - The ring primitive to imitate (do not reuse; it colours by score and shows a 0–100 number): `client/src/vendor/ui/primitives/CircularScore.tsx:3-47`.
  - Donut rendering to copy (do not import its legend): `client/src/vendor/ui/charts/Donut.tsx:22-42` (`PieChart` `width/height`, `Pie dataKey="value" nameKey="label" isAnimationActive={false}`, `Cell fill`).
  - `formatCost` as in Step 8.
- Change:
  - `KpiCards({ data })`: four cards in a `<section aria-label>`, each with `data-kpi="<name>"`.
    - **Total runs**: `summary.runs`, plus `<span role="img" aria-label={t("kpi.runsSeriesAlt", …)}>` wrapping `<Sparkline data={runs_series.map(p => p.value)} />`.
    - **Total cost**:
      - `formatCost(total_cost_usd)` and an "Estimated" label (`estimate.label`) tied by `aria-describedby` to the `estimate.explanation` text (AC19);
      - when `costDelta(summary) != null`, a `data-cost-delta` element with `formatSignedCost(delta)` and `kpi.costDelta`, carrying the same Estimated label. Otherwise nothing renders (AC23, EC20).
    - **Avg accept rate**: an app-local SVG ring inside `role="img"` with `aria-label={t("kpi.acceptRingAlt", …)}`, `formatPercent(avg_accept_rate)`, and `t("decisions", { count: summary.decided })` (AC13). Null renders "—".
    - **Most active**: the name (as text, truncated with `title` plus the full name in `aria-label`, EC18), `kpi.mostActiveDetail`, or "—" when `most_active` is null.
  - `CostBreakdown({ data })`: heading `breakdown.title`, the Estimated label plus explanation, and two `CostDonut`s (`byAgent` from `cost_by_agent`, `byModel` from `cost_by_model`). Each segment label is resolved:
    - `kind === "deleted_agent"` → `table.deletedAgent`;
    - `kind === "unknown_model"` → `breakdown.unknownModel`;
    - otherwise the `label` text.

    An empty array shows `breakdown.noCost`.
  - `CostDonut({ title, segments })`:
    - a `recharts` `PieChart` ring marked `aria-hidden`, colours from `DONUT_COLORS` by index;
    - a `<ul>` legend: one `<li data-cost-segment>` per segment with a colour swatch, the label as text, `formatCost(value)` and the percentage from `withPercents` (`breakdown.legendItem`). Colour is never the only carrier (NFR5).
  - All names and slugs render as text nodes only; no `dangerouslySetInnerHTML`.
- Skills: `frontend-ui-architecture`, `react-best-practices`, `security`.
- Done when: `.claude/scripts/check-changed.sh client` passes.
- Depends on: 9
- Agent: implementer — Phase: 3

### Step 11 — Per-agent table: sort, small-sample badge, trend arrow, expandable rows, View link  (package: client)
- Covers: AC13 (row denominator, Runs column), AC14, AC18, AC19 (Avg cost and expanded cost by model labelled Estimated), AC20 (sort and expand make no request), AC21, AC23 (trend arrow), EC3, EC4, EC8, EC18, NFR5, untrusted agent names and model slugs
- Files, all NEW, under `.../AgentPerformanceView/_components/`:
  - `PerfTable/{PerfTable.tsx,index.ts}`;
  - `PerfRow/{PerfRow.tsx,index.ts}`.
- Context:
  - `Badge({ children, color, bg, icon })` is at `client/src/vendor/ui/primitives/Badge.tsx:5-21`.
  - Icons `ArrowUp`/`ArrowDown` via `Icon` from `@devdigest/ui` (`client/src/vendor/ui/icons.tsx:119-120`).
  - The View target route exists: `client/src/app/agents/[id]/page.tsx`.
  - `next/link` usage precedent: `client/src/app/repos/[repoId]/onboarding/_components/OnboardingView/_components/StatusNotes/StatusNotes.tsx:4`.
- Change:
  - `PerfTable({ rows })`:
    - `const [dir, setDir] = useState<"desc" | "asc">("desc")`; `sorted = sortRows(rows, dir)`, derived during render.
    - A semantic `<table>`. Column headers: Agent, Runs, Avg cost (with the Estimated label), Avg dur., Accept, Last run, View.
    - The Accept header is a `<th aria-sort={dir === "desc" ? "descending" : "ascending"}>` with a `<button>` that toggles `dir` (AC14).
  - `PerfRow({ row })`, `<tr data-agent-id={row.agent_id ?? "deleted"}>`:
    - Agent cell: an expand toggle `<button aria-expanded aria-controls={detailsId} aria-label={t(expanded ? "table.collapse" : "table.expand", { name })}>`; local `useState` for expanded; the name as text (or `table.deletedAgent`), truncated with `title`.
    - Runs cell: `row.runs` (AC13).
    - When `row.runs === 0`, the label `table.noRunsInPeriod` and "—" in Avg cost, Avg dur., Accept and Last run (AC18).
    - Otherwise:
      - `formatCost(avg_cost_usd)`, `formatDuration(avg_latency_ms)`;
      - Accept: `formatPercent(accept_rate)` plus `t("decisions", { count: decided })` (AC13, EC4);
      - when `isSmallSample(decided)`, `<Badge data-small-sample>{t("table.smallSample", { count: decided })}</Badge>`; never on rows with `decided ≥ 10` (AC14);
      - when `trendDirection(row)` is non-null, an icon in `<span role="img" aria-label={t("table.trendUp" | "table.trendDown")} data-trend="up|down">` (AC23);
      - `formatRelativeTime(last_run_at)`.
    - View: `<Link href={`/agents/${row.agent_id}`} aria-label={t("table.viewAgent", { name })}>`, omitted when `agent_id` is null (EC8).
    - Expanded: a second `<tr id={detailsId} data-agent-details>` with:
      - `findings_by_severity` (Critical / Warning / Suggestion counts);
      - accepted, dismissed and pending counts;
      - `cost_by_model` as a text list (`formatCost`, the Estimated label, `breakdown.unknownModel` for `kind === "unknown_model"`).

      All from the loaded row; no fetch (AC21, AC20).
- Skills: `frontend-ui-architecture`, `react-best-practices`, `security`.
- Done when: `.claude/scripts/check-changed.sh client --full` passes (end of Phase 3).
- Depends on: 8, 10
- Agent: implementer — Phase: 3

### Step 12 — MAIN SESSION ONLY: GLOBAL sidebar section in the vendored nav, and its test  (package: client)
- Covers: AC1, NFR6 (label from `shell:nav.agent-performance`)
- **Executor: the main session, not the implementer** (root INSIGHTS "The implementer cannot apply a plan-sanctioned vendor edit"; `.claude/hooks/implementer-path-guard.sh:23-24`). The user approved this edit (OQ6, closed).
- Files:
  - `client/src/vendor/ui/nav.ts`;
  - `client/src/components/app-shell/nav.test.tsx`.
- Context:
  - `NAV` is at `client/src/vendor/ui/nav.ts:21-38`; `NavItemDef` at `:5-14`.
  - `Sidebar` renders `grp.section` and each `NavItem`, active when `ctx.activeKey === it.key` (`client/src/vendor/ui/shell/Sidebar.tsx:45-69`). `NavItem` renders `item.label` (`NavItem.tsx:54`).
  - `activeKeyFor("/agent-performance")` already returns `"agent-performance"` (`client/src/components/app-shell/helpers.ts:37`).
  - The command palette lists every `NAV` item (`client/src/components/app-shell/hooks/useShellCommands.ts:21-29`), so Agent Performance appears there automatically under the group "GLOBAL".
  - The existing test is at `nav.test.tsx:1-25`; the shell JSON import precedent is `onboarding-nav.test.tsx:4`.
- Change (exact content):
  - `nav.ts`: insert a third group after the SKILLS LAB group (after `:37`, before `];`):
    ```ts
      {
        section: "GLOBAL",
        items: [
          { key: "agent-performance", label: "Agent Performance", icon: "Gauge", href: "/agent-performance" },
        ],
      },
    ```
    No `gKey` and no `SHORTCUTS` change.
  - `nav.test.tsx`: add `import shell from "../../../messages/en/shell.json";` after `:3`, and append inside the `describe` block:
    ```tsx
      it("puts only Agent Performance in GLOBAL (SPEC-04 AC1)", () => {
        expect(keysOf("GLOBAL")).toEqual(["agent-performance"]);
        const item = NAV.find((g) => g.section === "GLOBAL")!.items[0]!;
        expect(item.href).toBe("/agent-performance");
        expect(item.label).toBe(shell.nav["agent-performance"]);
      });

      it("renders the Agent Performance link under the GLOBAL heading, and no other GLOBAL entry", () => {
        render(<Sidebar ctx={{ activeKey: "agent-performance" }} />);
        const global = screen.getByText("GLOBAL").parentElement!;
        expect(within(global).getByText("Agent Performance").closest("a")).toHaveAttribute("href", "/agent-performance");
        for (const label of [shell.nav.memory, shell.nav["multi-agent"], shell.nav["ci-runs"]]) {
          expect(within(global).queryByText(label)).not.toBeInTheDocument();
        }
      });
    ```
  - The existing WORKSPACE and SKILLS LAB assertions (`:10-24`) stay unchanged.
- Skills: `frontend-ui-architecture`.
- Done when: `.claude/scripts/check-changed.sh client` passes, including `nav.test.tsx`, `onboarding-nav.test.tsx` and the smoke test.
- Depends on: none (independent of Phases 1–3; run it after Phase 3, before plan-verifier)
- Agent: main session — Phase: 4

## 5. Test plan
- Existing suites to run:
  - per step: `.claude/scripts/check-changed.sh server` / `client` (`server client` after Step 1); `--full` at the end of each phase;
  - `.claude/scripts/check-changed.sh server --it` runs the two NEW `agent-performance*.it.test.ts` files (Docker). No existing `.it.test.ts` is affected: no schema, seed or shared-module change. The flaky `reviews.it.test.ts` and `conventions-rescan-preserves-decisions.it.test.ts` follow server INSIGHTS.
  - client: `nav.test.tsx`, `onboarding-nav.test.tsx` and `client/src/test/` smoke (vendored `nav.ts` changes).
- Tests to add or change (owner: test-writer, except `nav.test.tsx`, which is owned by the main session in Step 12):
  - `server/test/contracts.test.ts` (extend) — NFR7, NFR4, AC11. Lane: hermetic. Pattern at `server/test/contracts.test.ts:392-404`. It asserts:
    - the Agent Performance block (`// Agent Performance  (GET /agents/performance)` … `// re-export Severity-adjacent`) of the two `productionize.ts` copies is identical;
    - the Per-agent Stats block (`// Per-agent Stats` … `// Cross-session memory curator`) of the two `observability.ts` copies is identical;
    - a full `AgentPerf` fixture parses, including a deleted-agent row with `agent_id: null` and segments of all four kinds;
    - `kind: "other"` fails;
    - `AgentStats` without `period` fails.
  - NEW `server/test/agent-performance-domain.test.ts` — AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC18, AC22, NFR4, EC4, EC6, EC7, EC8, EC9, EC10, EC11, EC17, EC20, EC21. Lane: hermetic; no mocks; a fixed estimator `(m, i, o) => m === "priced" ? (i + o) / 1e6 : null`. It asserts:
    - AC6/EC11: runs at `from − 1 ms`, `from`, `to − 1 ms` and `to` → current `runs = 2`; the `from − 1 ms` run lands in the previous window;
    - AC7: 3 accepted, 1 dismissed, 2 pending → `decided 4`, `accept_rate 0.75`, `pending 2`; no decisions → `accept_rate` null, not 0 (EC4);
    - AC8: agents at 9/10 and 1/10 → 0.5; adding an agent at 1/1 → 11/21, not the mean of rates;
    - AC10/EC7: costs 0.02, 0.03 and one null → total 0.05, `unpriced_runs 1`; all null → null; a zero-token run with a null cost is unpriced;
    - AC11/EC8/EC9: |Σsegments − total| ≤ 1e-9 for both arrays; an `agentId: null` run → `kind: "deleted_agent"`, `label: null`; a null model → `"unknown_model"`; segments sorted descending; empty when the total is null;
    - AC12/EC10: 5, 7 and 7 runs → the 7-run agent with the newer last run; equal last run → the earlier name; deleted bucket never chosen; empty → null;
    - AC18: an agent with no runs gets a row with `runs 0`, null rates and `last_run_at` null, after the rows with runs;
    - AC22/EC20/EC21: `previous_total_cost_usd`, `previous_accept_rate`, `previous_decided`; 24 h → 24 hourly buckets; 48 h → 48; 30 days → 30 daily buckets; labels aligned to `from`; Σ`runs_series` = `summary.runs`; a 49 h period → 3 daily buckets;
    - EC6: a failed run with tokens counts in runs and cost, not in `avg_latency_ms`;
    - EC17: two runs of one agent on one PR both count;
    - AC9: for one agent, `buildAgentStats` equals that agent's `buildAgentPerformance` row in the nine AC9 fields;
    - NFR4: the recursive key set of a full output equals the contract's key set and contains no `title`, `rationale`, `suggestion`, `file`, `prompt` or `diff`.
  - NEW `server/test/agent-performance-service.test.ts` — AC9, AC20, NFR3, NFR8. Lane: hermetic; an in-memory fake of `AgentPerformanceRepositoryPort` (onion `references/testing.md` "Fakes, not mocks"). It asserts:
    - `performance` reads the window `[previous.from, to)`;
    - `agentStats` on an unknown agent throws `NotFoundError`;
    - NFR8: a fake whose `listFinishedRuns` throws → exactly one `logger.error` call whose object is `{ event, route, from, to }` and contains no agent name, then rethrows `AggregationFailedError` (statusCode 500);
    - the fake records no write (it has none) and the deps have no LLM.
  - NEW `server/test/agent-performance.it.test.ts` — AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC17, AC20, AC22, NFR2, NFR3, EC5, EC12, EC16. Lane: it.
    - Setup pattern: `server/test/brief.it.test.ts:19-23,58-71`.
    - Each case inserts its own workspace, repo and PR, then builds the app with `overrides: { auth: new MockAuthProvider(undefined, { id: ws.id, name: ws.name }), secrets: new MockSecretsProvider(), llm: { openai, anthropic, openrouter } }`. The `llm` fakes count calls (`server/src/adapters/mocks.ts:312-330`).
    - Runs, reviews (with `runId`) and findings are inserted directly.
    - It asserts:
      - AC5: on both endpoints → 422 `validation_error` and no aggregate body for:
        - a missing `from`;
        - a missing `to`;
        - `from=yesterday`;
        - `from=2026-01-01` (no time);
        - `from ≥ to`;
        - `to − from` = 366 days + 1 ms.

        Exactly 366 days → 200.
      - EC12: a crafted URL is still validated server-side.
      - AC6/EC5: boundary runs plus one `running` run → `runs = 2`.
      - AC9: field-by-field equality of `/agents/:id/stats` vs the dashboard row for 1-day, 30-day and custom periods.
      - AC10, AC11, AC12 end to end.
      - AC17: an empty workspace → `has_any_runs false`; runs only outside the period → `summary.runs 0`, `has_any_runs true`.
      - AC22: seeded runs in both windows.
      - EC16: a decision made after a run counts with that run's period.
      - AC20/NFR3: `agent_runs`, `reviews` and `findings` row counts are unchanged after 10 GETs, and the LLM fakes record 0 calls.
      - NFR2: no 429 after 10 calls (the global limit is off in test, and no per-route limit is set).
      - Routing: `GET /agents/performance?…` → 200 `AgentPerf` (not the `/agents/:id` 422); `/agents/<unknown uuid>/stats` → 404 `not_found`; `/agents/not-a-uuid/stats` → 422.
      - Workspace scoping: another workspace's runs are not counted.
  - NEW `server/test/agent-performance-perf.it.test.ts` — NFR1. Lane: it.
    - Bulk-seed one workspace with 20 agents, 10,000 counted runs in the period, 10,000 reviews and 50,000 findings. Use chunked multi-row inserts of at most 2,000 rows per statement (Postgres has a bind-parameter limit; `drizzle-orm-patterns/SKILL.md` "Batch Operations").
    - One warm-up request, then 20 sequential `GET /agents/performance` (30-day period) → p95 ≤ 1,000 ms, and `summary.runs === 10000`.
    - Gated on Docker like the others.
  - `client/src/components/app-shell/helpers.test.ts` (extend) — AC1. Lane: client. It asserts `activeKeyFor("/agent-performance") === "agent-performance"` and `activeKeyFor("/agents") === "agents"`.
  - `client/src/components/app-shell/nav.test.tsx` — AC1. Lane: client. Owner: **main session** (Step 12).
  - NEW `client/src/app/agent-performance/_components/AgentPerformanceView/helpers.test.ts` — AC3, AC4, AC14, AC23, EC12, EC15. Lane: client. It covers:
    - `parsePeriodQuery`: valid; missing; `from ≥ to`; over 366 days; garbage; unknown range → custom;
    - `presetPeriod("30d")` → `to − from` = 30 × 24 h;
    - `customRangeToPeriod`: start after end; end after today; 366 inclusive days → `tooLong`; 365 → ok; both days included;
    - `periodToDateInputs` round-trips a custom period;
    - `sortRows` group order in both directions, with no-run rows always last;
    - `trendDirection`: null when either count < 10; equal rounded rates → null;
    - `costDelta`: null when either total is null;
    - `formatSignedCost` keeps "<$0.0001";
    - `formatPercent(null)` → "—".
  - NEW `client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.test.tsx` — AC2, AC3, AC4, AC13, AC14, AC15, AC16, AC17, AC18, AC19, AC20, AC21, AC23, NFR2, NFR5, NFR6, EC13, EC18, untrusted names. Lane: client.
    - Mocks: `@/components/app-shell` (ConventionsView pattern); `next/navigation` with a `replace` spy and a controllable `useSearchParams` (`client/src/app/repos/[repoId]/pulls/[number]/page.test.tsx:12`).
    - Rendering: a real `QueryClientProvider` (`client/src/app/agents/_components/AgentCard/AgentCard.test.tsx:4,30`) and a stubbed `fetch` that records URL and method; `NextIntlClientProvider` with `agentPerformance.json`.
    - It asserts:
      - NFR2/AC3: one GET to `/agents/performance` on open, with `to − from` = 30 × 24 h; with a valid query, the same `from`/`to` as the URL, and the picker shows that period;
      - AC2: picking "1 day" → `replace` with a `from`/`to`/`range` query, then one new GET for those values;
      - AC4: an invalid custom range → error text from `period.errors.*`, `aria-invalid`, no `replace` and no new fetch;
      - AC15: with a never-resolving fetch, no text matching `/\d|\$|%/` inside the KPI, table and legend regions;
      - AC16: a rejected fetch → `loadError` text and a Retry button, with no "0", "$0.00" or "0%"; Retry fetches again;
      - AC17: the two empty states, with no KPI zeros;
      - AC13: "N decisions" in the KPI and in each row; the Runs cell equals `runs`;
      - AC14: clicking the Accept header orders `data-agent-id` rows; `aria-sort` flips; `[data-small-sample]` appears on every row with `decided < 10` and on none at or above 10;
      - AC18: a no-run row shows "No runs in period" and "—" in four cells, never "0%" or "$0.00";
      - AC19: "Estimated" label and explanation near Total cost, the delta, the Avg cost header and both legends;
      - AC20: after sort, expand and collapse, still only GET calls;
      - AC21: expanding sets `aria-expanded="true"` and shows severity counts, decision counts and cost by model, with no new fetch;
      - AC23: `[data-cost-delta]` absent when one total is null; `[data-trend]` absent when either count < 10, present with an accessible name otherwise;
      - NFR5: the toggle, sort button and picker controls take focus via `el.focus()`;
      - EC18: 50 agents → 50 rows, every segment in the legend;
      - untrusted names: an agent name `<img src=x onerror=alert(1)>` renders as text, with no `img` element.
- Needs Docker: yes, for `agent-performance.it.test.ts` and `agent-performance-perf.it.test.ts`.

## 6. Risks and open questions
- Q1 (non-blocking, the user decides): the accepted recommendation to reuse `Donut` and `MetricCard` conflicts with EC15, AC19 and NFR5 (evidence in §0). The plan reuses `Sparkline` only, and builds `CostDonut` and the KPI cards locally. Alternative: a main-session edit of the vendored `Donut.tsx`/`MetricCard.tsx` (formatter, legend and label props, plus showcase updates). The plan does not include it. If the user prefers that, it becomes another main-session step before Phase 3.
- Risk: the vendored `NavItem` marks the active item only visually (font weight, accent bar; `client/src/vendor/ui/shell/NavItem.tsx:32-53`), with no `aria-current`. AC1's "active" is asserted through `activeKeyFor` and `ctx.activeKey`. Adding `aria-current` would be another vendor edit; out of scope.
- Risk: the custom-range local-date conversion around DST. A 365-day local range can be 365 × 24 h ± 1 h; the server limit is 366 days, so it still passes. `helpers.test.ts` pins the inclusive day count.
- Risk: read-time re-pricing (`PriceBook`) can change a re-priced run's cost between two requests. AC9 compares two separate requests; the IT test removes this with `MockSecretsProvider`. In production, persisted `cost_usd` covers every run since migration 0010 (`server/src/platform/run-cost.ts:5-10`).
- Risk: NFR1 on a slow Docker host. The query has no supporting index on `agent_runs.ran_at` or `reviews.run_id`, and NFR7 forbids a migration. With 20k rows a sequential scan is expected to stay well under 1 s. If the perf test fails, the fallback is a follow-up spec for indexes, not a change here.
- Risk: the `ErrorState` Retry label is hard-coded English in the vendored primitive (`client/src/vendor/ui/primitives/ErrorState.tsx:54`). This is accepted as existing vendor behaviour; the other new strings are i18n.
- Risk: the command palette now has two "GLOBAL" groups (the nav section and `shell:commandPalette.globalGroup` for Settings, `useShellCommands.ts:25,33`). Both render with the same heading; cosmetic only.
- Spec gaps in §0 are routed to spec-creator; none blocks.

## 7. Not verified
- That Fastify (find-my-way) gives the static `/agents/performance` precedence over `/agents/:id` when the two are registered by different encapsulated plugins. This is expected behaviour; the routing case in `agent-performance.it.test.ts` proves it.
- That `fastify-type-provider-zod` v4 (`server/package.json:29`) reports a `superRefine` issue on a `querystring` schema through `hasZodFastifySchemaValidationErrors`, so the response is 422 rather than 500. Expected; the AC5 IT cases prove it. Fallback: do the `from < to` and range check in the handler and throw `ValidationError` (`server/src/platform/errors.ts:25-28`), which also gives 422.
- That zod 3.24 `z.string().datetime({ offset: true })` accepts the `Z` suffix sent by `Date.prototype.toISOString` (from zod docs knowledge; not run).
- That `recharts` `PieChart` with a fixed width and height renders under jsdom. This is inferred from the showcase smoke test rendering `Donut` (`client/src/components/showcase/Showcase.tsx:213`).
- The exact CSS variable names for donut colours in `client/src/vendor/ui/styles.css` (not read). `--accent`, `--ok`, `--warn`, `--crit` and `--text-muted` are seen in vendored components.
- The drizzle 0.38 syntax for `count(*) filter (where …)` inside `sql` template columns. It is standard Postgres; the exact drizzle form is the implementer's choice.
- That `client/src/lib/providers.tsx` still sets `retry: 1` and `staleTime: 30_000` (taken from `frontend-ui-architecture/references/this-repo.md`, not re-read). The hook sets `retry: false` explicitly.

## 8. Execution mode
- Mode: multi-agent. Chosen by: user (via the orchestrator).
- Phases (each is one fresh `implementer` run and one commit point, except Phase 4):
  - Phase 1 — vendored shared contracts (server + client) — step 1 — check: `.claude/scripts/check-changed.sh server client`.
  - Phase 2 — server — steps 2, 3, 4, 5 — check: `.claude/scripts/check-changed.sh server` per step, `--full` at the end; optional `--it`.
  - Phase 3 — client — steps 6, 7, 8, 9, 10, 11 — check: `.claude/scripts/check-changed.sh client` per step, `--full` at the end.
  - Phase 4 — **main session** — step 12 (vendored `nav.ts` + `nav.test.tsx`) — check: `.claude/scripts/check-changed.sh client`. Commit point after it.
- Hand-off order (one writer at a time; the main session stays at the repo root):
  1. `implementer` — Phase 1 (input: this plan, §2, §3, Step 1). Commit point.
  2. `implementer` — Phase 2. Commit point.
  3. `implementer` — Phase 3. Commit point.
  4. Main session — Phase 4 (Step 12, exact content in §4). Commit point.
  5. Bundle (`node .claude/skills/pr-self-review/scripts/bundle.mjs write`), then `plan-verifier` (scope `code`).
  6. `architecture-reviewer` and `security-reviewer` in parallel (read-only). Security focus:
     - `from`/`to` validation and use only as bound parameters;
     - the range cap (resource exhaustion);
     - workspace scoping in every repository query, including the `reviews` join;
     - no finding text, prompt or diff in responses (NFR4);
     - the failure log without names (NFR8);
     - agent names and model slugs rendered as text in the table, KPI card, legend and `title` attributes;
     - GET-only behaviour.
  7. `test-writer` — §5 (except `nav.test.tsx`); runs `.claude/scripts/check-changed.sh server client --full` and `server --it`.
  8. `plan-verifier` (scope `final`).
  9. `doc-writer`:
     - `server/README.md` API map (two routes);
     - `client/README.md` route map (`/agent-performance`);
     - the INSIGHTS entry from §0 (`reviews.run_id` link).
- Parallel: only step 6 (read-only reviewers). No worktree is needed.
- Gates:
  - `check-changed.sh` PASS per phase (only the 8 known cycles);
  - plan-verifier `code` before the reviews;
  - CRITICAL and HIGH findings fixed before tests;
  - plan-verifier `final` COMPLETE before docs;
  - `/pr-self-review` before the PR.
