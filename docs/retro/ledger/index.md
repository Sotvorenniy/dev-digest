# Workflow retro ledger

One row per workflow run, appended by `.claude/skills/workflow-retro/scripts/retro.mjs ledger`.
Each run's qualitative insights live in a sibling file, linked from the "Run" column.
Compare rows to see the trend between runs. Token columns are summed over every agent of the
run (deep mode); "input processed" = uncached input + cache writes + cache reads.

| Date | Run | Mode | Agents | Turns | Tool calls | Input processed | Cache read | Output | Wall clock | Max conc. | Top findings | Actions taken |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-14 | [project-context-plan](2026-10-14-project-context-plan.md) | deep | 4 | 109 | 172 | 8.14M | 94% | 11.0k | 28.5 min | 3 | duplicate-context ×2, overloaded-role ×2, big-result ×2 | 9/9 proposals applied: spec-creator one-Write, image downscale, Explore on sonnet, trust Explore, Code anchors section, fixed final report; orchestrator batches questions |
| 2026-10-14 | [onboarding-tour-run](2026-10-14-onboarding-tour-run.md) | deep | 16 | 247 | 371 | 24.54M | 93% | 50.9k | 323.3 min | 6 | preload-shared ×6, duplicate-context ×5, big-result ×4 | 3 now-proposals applied: path guards use repo root, retro quick mode counts hand-back agents, plan-verifier tool/Bash rules |
| 2026-10-15 | [pr-why-risk-brief](2026-10-15-pr-why-risk-brief.md) | quick | 16 | 117 | 564 | 19.32M | 90% | 65.6k | 224.6 min | — | none | 3 now-proposals applied: run-plan base_sha + push preflight, test-writer known-failure and no-own-component-mock rules |
| 2026-10-23 | [spec-08-multi-agent-review](2026-10-23-spec-08-multi-agent-review.md) | deep | 13 | 410 | 646 | 59.18M | 95% | 395.5k | 14840.1 min | 3 | preload-shared ×12, big-result ×8, duplicate-context ×7 | real-$ costing added ($47.05 for spec->merged PR: $33.31 subagents + $13.73 orchestrator); branch-mixing with SPEC-09 flagged; 3 'now' proposals open, none applied yet |
