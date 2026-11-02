# docs — server

Deep-dives for the `server` package (pipelines, diagrams, design notes).
`AGENTS.md` links here via *Use when*. 

- Agent Performance (SPEC-04) routes, aggregation rules and repository queries: see [`../../docs/agent-performance.md`](../../docs/agent-performance.md) (cross-cutting, lives in root `docs/`).
- Agent Stats endpoint additions (SPEC-05: previous period, series, categories, skill and memory usage): see [`../../docs/agent-performance.md`](../../docs/agent-performance.md) ("Agent Stats tab (SPEC-05)").
- `eval-pipeline.md` — Eval Pipeline (SPEC-06): routes, scoring rules, `eval_cases` / `eval_set_runs`, run lifecycle and boot reaping, `verify:l06`, client surface.
- `multi-agent-review.md` — Multi-Agent Review (SPEC-08): `agent_ids` trigger, 4 s polled results read, finding grouping rule, attribution contract (`agent_id`, `agent_name`, `group_key`, `agreed_by`), known limits.
- Onboarding Tour (SPEC-02) server pipeline: see [`../../docs/onboarding-tour.md`](../../docs/onboarding-tour.md) (cross-cutting, lives in root `docs/`).
