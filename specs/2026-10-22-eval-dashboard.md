# Spec: Eval Dashboard
Spec ID: SPEC-07
Status: implemented
Supersedes: None
Modules: server, client

## Problem and user
**Who.** The single local dev-digest user who tunes several review agents and wants one place
that shows how every agent scores on its eval set, and a per-agent view of how the scores moved
over time.

**Relation to SPEC-06.** `specs/2026-10-22-eval-pipeline.md` (SPEC-06) builds eval cases, set
runs, the scoring rules, the run history and the compare view inside the agent editor's Evals
tab. This spec adds the sidebar page and a per-agent dashboard page on top of SPEC-06's runs.
Every SPEC-06 rule it shows (metric definitions, `null` → "—", deltas in signed points, the
three-way cost format, the compare view, the start-run rejections) still holds and is not
redefined here.

**Today.**
- The sidebar has no "Eval Dashboard" item. Its items are defined in the vendored
  `client/src/vendor/ui/nav.ts:21-44` (SKILLS LAB at 33-35, GLOBAL holds only Agent Performance at
  41), with labels written inline in that file. The shell already maps a path starting with
  `/eval` to the active key `eval` (`client/src/components/app-shell/helpers.ts:35`).
- `client/messages/en/eval.json` already holds a `dashboard.*` group (line 2, title "Eval
  Dashboard") and `page.*` crumbs (line 76).
- A contract `EvalDashboard` exists for one owner or the workspace
  (`server/src/vendor/shared/contracts/eval-ci.ts:68-89`), unused; no route serves it.
- The closest existing screens are the Agent Performance page (`client/src/app/agent-performance/`)
  and the agent Stats tab, which use the vendored `Sparkline` and `LineChart`
  (`client/src/vendor/ui/charts/index.ts:3-4`).

**Design sources** (user screenshots, guidance only):
1. "Eval Dashboard" (breadcrumb Skills Lab › Eval Dashboard; sidebar item under SKILLS LAB): an
   AGENTS list, one row per agent with the model chip, "Last run v7 · 2026-05-29 09:14 · 17/20
   pass", a sparkline and RECALL / PREC / CITE; a "Run all agents" button; RECENT EVAL RUNS · ALL
   AGENTS with agent, time, version, three bars with percentages and pass n/m.
2. Per-agent page (breadcrumb … › Security Reviewer; "‹ All agents"): title with the model chip,
   "Regression harness · 5 runs on the 20-trace gold set", an agent selector, a "30 days" filter,
   "Run eval"; an alert banner "Precision dipped 2pts on v7 …"; three metric cards with a
   sparkline and a signed delta; METRIC TREND chart (recall, precision, citation); RECENT RUNS
   table (checkbox, ran at, version, recall, precision, citation, pass, cost) with "Compare".

Deviations, decided with the user: "Run all agents", the agent selector, the period filter and
the alert banner are not built (NG1-NG4); "traces" reads "cases".

## Goals / Non-goals
### Goals
- G1 A sidebar entry that opens a workspace-wide Eval Dashboard.
- G2 One row per agent with its latest eval result, so the user sees which agent regressed.
- G3 A list of the most recent eval runs across all agents.
- G4 A per-agent page with the latest metrics, their change, the trend over runs and the run
  table with Compare.

### Non-goals
- NG1 "Run all agents" (starting runs for every agent at once).
- NG2 The agent selector on the per-agent page (navigation is through the agent list).
- NG3 The "30 days" period filter.
- NG4 The alert banner ("Precision dipped …").
- NG5 "Promote vN" in the compare view (as SPEC-06 NG5).
- NG6 Skill-owned eval sets (as SPEC-06 NG6).
- NG7 Any change to scoring, run execution or the compare view; those belong to SPEC-06.

## User stories
- US1. As an agent author, I want an Eval Dashboard in the sidebar, so that I can find eval
  results without opening each agent.
- US2. As an agent author, I want each agent's latest eval scores in one list, so that I can spot
  a regression across agents.
- US3. As an agent author, I want to see the newest eval runs of all agents, so that I know what
  ran recently.
- US4. As an agent author, I want a per-agent page with the trend and the run table, so that I
  can see how scores moved and compare two runs.

## Acceptance criteria (EARS)
- AC1 (US1). The sidebar (shall) show an "Eval Dashboard" item in the SKILLS LAB section that
  opens the Eval Dashboard page and is marked active on that page and on the per-agent page.
  _(observable: nav item with key `eval`; `aria-current="page"` on `/eval` paths)_
- AC2 (US2). WHEN the user opens the Eval Dashboard, the page (shall) list
  every agent that has at least one eval case, and no other agent, with, per agent, its name, current model, and the latest finished run's agent version,
  finish time, passed / total, recall, precision and citation accuracy. _(observable: one row per
  agent from the dashboard response; values equal the SPEC-06 run; "—" for null)_
- AC3 (US2). WHILE an agent has eval cases but no finished run, its row (shall) show "never run"
  instead of metrics. _(observable: i18n key `eval.dashboard.neverRun`; no metric values)_
- AC4 (US2). The agent row (shall) show a sparkline of recall over that agent's newest
  10 finished runs, oldest to newest, with a text
  alternative stating the first and last value. _(observable: sparkline with N points; accessible
  name contains both values)_
- AC5 (US3). WHEN the Eval Dashboard loads, the page (shall) list the newest
  10 eval runs across all agents, newest first, each with
  agent name, finish time, agent version, recall, precision, citation accuracy and passed /
  total. _(observable: rows ordered by `finished_at` descending; running runs show the running
  state instead of metrics)_
- AC6 (US4). WHEN the user activates an agent row, the client (shall) open that agent's eval
  page, which has an "All agents" link back to the Eval Dashboard. _(observable: navigation to the
  per-agent page; the back link returns to the dashboard)_
- AC7 (US4). WHEN the per-agent page loads, it (shall) show cards for recall, precision and
  citation accuracy of the latest finished run, each with its signed change against the previous
  finished run, as defined in SPEC-06 AC14. _(observable: three cards; signed point delta; no
  delta on the first run; "—" for null)_
- AC8 (US4). The per-agent page (shall) show a trend chart with one point per finished run, in
  chronological order, for recall, precision and citation accuracy, with a legend and a text
  alternative (a table of the plotted values). _(observable: three series with the run count as
  points; a visually hidden or toggleable data table with the same values)_
- AC9 (US4). The per-agent page (shall) list the agent's runs newest first with a labelled
  checkbox, finish time, agent version, recall, precision, citation accuracy, passed / total and
  cost, and (shall) open the SPEC-06 compare view when exactly two runs are selected and the user
  chooses Compare. _(observable: Compare disabled unless 2 rows are checked; the dialog content
  equals SPEC-06 AC15)_
- AC10 (US4). WHEN the user chooses "Run eval" on the per-agent page, the client (shall) start a
  run for that agent through the SPEC-06 start route and show the running state. _(observable:
  `POST /agents/:id/eval-runs` called once; SPEC-06 AC10 rejections shown by their i18n message;
  the button disabled while running)_
- AC11 (US1, US2). IF no agent has an eval case, THEN the Eval Dashboard (shall) show an empty
  state that explains eval cases come from findings and links to the Agents page. _(observable:
  empty-state text by i18n key; link to `/agents`)_
- AC12 (US2, US4). IF loading the dashboard or the per-agent page fails, THEN the page (shall) show
  an error state with a retry action, and (shall) show skeletons in the final layout while the
  first load runs. _(observable: error text by i18n key and a Retry button that refetches;
  skeleton rows during the first load)_
- AC13 (US4). IF the per-agent page is opened for an agent that does not exist, THEN it (shall)
  show a not-found state with a link back to the Eval Dashboard. _(observable: 404 from the API →
  not-found text and back link)_

## Contracts
Wire fields are snake_case. Both `shared` copies carry the identical shapes (NFR5). Metric
fields reuse SPEC-06 `EvalSetRun` (`recall`, `precision`, `citation_accuracy` nullable 0..1,
`cases_passed`, `cases_total`, `cost_usd` nullable, `agent_version`, `status`, `finished_at`
nullable). The existing `EvalDashboard` (`server/src/vendor/shared/contracts/eval-ci.ts:68-89`) may
be changed or replaced; nothing uses it today.

**Workspace dashboard** (`GET /eval/dashboard`)
| Field | Type | Nullability |
|---|---|---|
| `agents[]` | object | required (may be empty) |
| `agents[].agent_id` / `name` / `model` | string | required |
| `agents[].cases_total` | int | required |
| `agents[].latest` | `EvalSetRun` (finished) | nullable (never run) |
| `agents[].recall_series` | number[] (oldest → newest; null points left out) | required (may be empty) |
| `recent_runs[]` | `EvalSetRun` + `agent_name` string | required (may be empty) |

**Per-agent dashboard** (`GET /agents/:id/eval-dashboard`)
| Field | Type | Nullability |
|---|---|---|
| `agent_id` / `name` / `model` | string | required |
| `cases_total` | int | required |
| `latest` / `previous` | `EvalSetRun` (finished) | nullable |
| `trend[]` | `{ run_id, finished_at, recall, precision, citation_accuracy }` (metrics nullable) | required |
| `runs[]` | `EvalSetRun`, newest first | required |

Errors: `GET /agents/:id/eval-dashboard` → 404 `not_found` for an unknown agent. Both routes are
read-only and stay under the global 120 requests/min limit (`server/src/app.ts:110`).

## Edge cases
- EC1. No agent has cases → AC11.
- EC2. An agent with cases and no finished run → AC3; its sparkline is empty.
- EC3. An agent's only runs are `running` → treated as "never run" for the row (AC3); the run
  shows as running in Recent eval runs (AC5).
- EC4. A `partial` run → counts as finished; its metrics exclude errored cases (SPEC-06 AC13); the
  passed / total shows the errored cases as not passed.
- EC5. A `failed` run (every case errored) → listed in the tables with "—" metrics; not plotted in
  the trend and never used as `latest` (agent row or cards); `latest` is the newest `done` or
  `partial` run, and an agent whose runs are all `failed` shows the "never run" / no finished run
  state (AC2, AC3, AC7).
- EC6. Null metric values → "—"; a null point is left out of the sparkline and the trend
  (Contracts; AC4, AC8).
- EC7. Many agents or many runs → AC5 caps the recent list at 10; the per-agent run table shows
  the newest 20 runs, with no paging (AC9; same rule as SPEC-06 EC19).
- EC8. An agent deleted after its runs → its rows disappear with it (SPEC-06 NFR8).
- EC9. Long agent names → truncated with the full name available; no horizontal overflow (NFR3).
- EC10. A run finishes while the page is open → the page shows it after the next refetch on focus
  or after a run started from this page ends (AC10).
- EC11. Start-run rate limit or rejection (429, 409, 422) → SPEC-06 AC10 messages (AC10).
- EC12. Cost unknown / free / tiny → "—" / "$0.00" / "<$0.0001" (SPEC-06 EC16) in the run table.

## Non-functional requirements
- NFR1. Performance — `GET /eval/dashboard` answers in under 1 s at p95 on the dev stack with 10
  agents and 200 eval runs — verify: server-integration (timed against a seeded fixture).
- NFR2. Accessibility (WCAG 2.2 AA) — each agent row is one keyboard-reachable link with an
  accessible name containing the agent name (2.1.1, 4.1.2); deltas are signed text, never colour
  alone (1.4.1); the sparkline and the trend chart have text alternatives (1.1.1); checkboxes are
  labelled with the run's time and version (1.3.1) — verify: client.
- NFR3. Long content — agent names up to 200 characters render without horizontal overflow at
  1280 px and 200 % zoom (1.4.10) — verify: client (truncation and title), manual for zoom (jsdom
  has no layout).
- NFR4. i18n — strings live in `client/messages/en/eval.json` (`dashboard.*`, `page.*`); the
  sidebar label follows the existing inline-label pattern of `nav.ts` — verify: client.
- NFR5. Compatibility — the dashboard contracts are identical in both `shared` copies; the
  `nav.test.tsx` expectations change together with `nav.ts` — verify: server-unit (parity test),
  client.
- NFR6. Change process — `client/src/vendor/ui/nav.ts` is vendored; adding the item is a
  main-session step with the user's approval, because the implementer's path guard denies vendor
  edits (root INSIGHTS "The implementer cannot apply a plan-sanctioned vendor edit") — verify:
  review.

## Inputs and provenance
| Input | Source | Trusted? | Used in |
|---|---|---|---|
| Agent name and model | DB (user-authored) | Yes (user's own) | UI |
| Run metrics, versions, costs | DB (computed in code by SPEC-06) | Yes | UI |
| Case names (in a compare view opened from here) | DB (from model-authored finding titles) | No | UI |

## Untrusted inputs
- Case names and run result text reached through the reused compare view — reach the UI —
  threat: stored XSS (A05) — the client (shall) render them as text only — covered by: SPEC-06
  AC15 and its Untrusted inputs; AC9 here reuses that view unchanged.

## Traceability
| AC | Story | Goal | Covers (EC / NFR / untrusted input) | Verify by |
|---|---|---|---|---|
| AC1 | US1 | G1 | NFR4, NFR5, NFR6 | client |
| AC2 | US2 | G2 | EC6, EC8, EC9, NFR1, NFR2 | server-integration, client |
| AC3 | US2 | G2 | EC2, EC3 | client |
| AC4 | US2 | G2 | EC6, NFR2 | client |
| AC5 | US3 | G3 | EC3, EC4, EC5, EC7 | server-integration, client |
| AC6 | US4 | G4 | NFR2 | client |
| AC7 | US4 | G4 | EC5, EC6 | client |
| AC8 | US4 | G4 | EC5, EC6, NFR2 | client |
| AC9 | US4 | G4 | EC7, EC12, case names | client |
| AC10 | US4 | G4 | EC10, EC11 | client |
| AC11 | US1, US2 | G1, G2 | EC1 | client |
| AC12 | US2, US4 | G2, G4 | — | client |
| AC13 | US4 | G4 | — | server-integration, client |

NFR3 → client + manual (zoom; jsdom has no layout); NFR6 → review.

## Decisions
- Q1 — answered — this spec is the second half of the split; design extras "Run all agents",
  agent selector, 30-day filter, alert banner and Promote are not built — landed in: NG1-NG5.
- Non-blocking default accepted — the nav edit is a main-session step — landed in: NFR6.
- Non-blocking default accepted — "cases" instead of "traces" — landed in: Problem and user.
- OQ1 — answered 2026-10-22 — list only agents with at least one eval case — landed in: AC2,
  Contracts (`agents[]`).
- OQ2 — answered 2026-10-22 — sparkline over the last 10 finished runs — landed in: AC4.
- OQ3 — answered 2026-10-22 — "Recent eval runs" shows 10 runs — landed in: AC5, EC7.
- OQ4 — answered 2026-10-22 — a `failed` run is never "latest"; an agent with only failed runs
  shows the no-finished-run state — landed in: EC5.
- OQ5 — answered 2026-10-22 — per-agent run table shows the newest 20, no paging — landed in:
  EC7.
- SPEC-06 P9, P10, P11 — accepted there — reused here — landed in: AC9, EC12, NFR2.

## Open questions
- ~~OQ1. Does the dashboard list every agent of the workspace, or only agents with at least one
  eval case?~~ closed 2026-10-22 — only agents with at least one case (AC2).
- ~~OQ2. How many finished runs feed the per-agent sparkline?~~ closed 2026-10-22 — the last 10
  (AC4).
- ~~OQ3. How many runs does "Recent eval runs" show?~~ closed 2026-10-22 — 10 (AC5).
- ~~OQ4. Is a `failed` run the "latest" for the cards, or is it skipped for the last done/partial
  run?~~ closed 2026-10-22 — skipped; latest = newest done/partial (EC5).
- ~~OQ5. Is the per-agent run table capped or paged, and at how many rows?~~ closed 2026-10-22 —
  newest 20, no paging (EC7).
- OQ6. The per-agent page's route path (`/eval/agents/:id` or similar, under the `/eval` active
  key) — C2 — owner: implementation-planner — blocks: none — marker: none.

## Code anchors
- `client/src/vendor/ui/nav.ts:21-44` — NAV sections; SKILLS LAB items at 33-35; GLOBAL has only `agent-performance` (41); labels inline.
- `client/src/components/app-shell/helpers.ts:35` — `/eval` paths already map to active key `eval`.
- `client/src/components/app-shell/nav.test.tsx` — asserts the nav keys (root INSIGHTS "The implementer cannot apply a plan-sanctioned vendor edit").
- `client/messages/en/eval.json:2,76` — `dashboard.*` (title "Eval Dashboard") and `page.*` crumbs exist.
- `client/src/vendor/ui/charts/index.ts:3-4` — `Sparkline` (inline SVG, `data: number[]`) and `LineChart` (Recharts, multi-series) exported.
- `client/src/vendor/ui/charts/MetricCard.tsx:21-23,65` — shows `Math.abs(delta)` and colours any increase green (client INSIGHTS "Vendored Donut and MetricCard misreport…").
- `client/src/app/agent-performance/` — closest existing dashboard page.
- `server/src/vendor/shared/contracts/eval-ci.ts:57-89` — unused `EvalTrendPoint` and `EvalDashboard`.
- `server/src/modules/index.ts:33-51` — no eval module registered.
- `server/src/app.ts:110-112` — global 120/min rate limit.

## Changelog
- 2026-10-22 — draft created as the second half of the Eval Pipeline split (Q1 = two specs).
- 2026-10-22 — OQ1-OQ3 answered: only agents with cases are listed (AC2), sparkline over the
  last 10 finished runs (AC4), 10 recent runs (AC5); markers removed, no IDs renumbered.
- 2026-10-22 — OQ4 answered (failed runs never "latest", EC5) and OQ5 answered (run table =
  newest 20, no paging, EC7); last markers removed. Status unchanged.
