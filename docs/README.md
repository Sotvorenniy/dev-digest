# docs — root

Cross-cutting deep-dives (diagrams, design notes) that belong to no single package.
`AGENTS.md` links here via *Use when*. Currently holds `agent-prompts/`.

## Index
- [agent-performance.md](agent-performance.md) — Agent Performance dashboard (SPEC-04): `GET /agents/performance` and `/agents/:id/stats`, shared aggregation rules, cost estimate handling, `/agent-performance` client route.
- [onboarding-tour.md](onboarding-tour.md) — Onboarding Tour (SPEC-02): one-call generation with skeleton fallbacks, reading-path ranking, grounding of paths and commands, limits, API.
- [pr-brief.md](pr-brief.md) — PR Why + Risk Brief (SPEC-03): one-call generation, grounding of risks and review focus, head_sha staleness, card states, deep link, limits.
- [project-context.md](project-context.md) — Project Context (SPEC-01): doc discovery, attachment, run-time prompt assembly and trace; routes, caps, statuses, path safety.
