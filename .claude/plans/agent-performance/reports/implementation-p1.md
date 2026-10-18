# Implementation Report: Phase 1 (Step 1) — done
- Changed: server+client vendor/shared/contracts/observability.ts (PerfPeriod; AgentStats + period, decided, unpriced_runs, last_run_at, cost_basis), server+client vendor/shared/contracts/productionize.ts (PerfSeriesPoint, PerfCostSegmentKind, PerfMostActive, reworked PerfCostSegment/AgentPerfRow/AgentPerf), client/src/lib/types.ts:44 re-export.
- Deviations: none (PerfCostSegment moved above AgentPerfRow).
- check-changed.sh server client: PASS typecheck x2, PASS related tests (server 257 passed). Onion gate line not printed.
- Note: productionize.ts copies already differed before (provider enum 'openrouter' server-only, line 36), left as is.
