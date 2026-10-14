# Run state files

Both files live in `.claude/plans/<slug>/` and are written only by the main session.

## `state.json`

```json
{
  "slug": "pr-filters",
  "created_at": "2026-10-14T10:00:00Z",
  "updated_at": "2026-10-14T11:20:00Z",
  "stage": "review",
  "stage_status": "running",
  "plan": { "path": ".claude/plans/pr-filters.md", "sha256": "…", "mode": "multi-agent", "phases_done": [1, 2] },
  "spec": { "path": "client/specs/2026-10-10-pr-filters.md", "id": "SPEC-07" },
  "options": { "with_tests": false, "docs": true, "max_review_rounds": 3 },
  "gates": { "G1": [], "G2": null },
  "verify": { "code_rounds": 1, "code_verdict": "COMPLETE", "final_verdict": null },
  "review": { "round": 2, "open_critical_high": [3, 1] },
  "reports": ["reports/implementation-p1.md", "reports/verify-code-r1.md"]
}
```

- `stage`: `intake | build | verify | review | reverify | tests | docs | pr | done | stopped`.
- `stage_status`: `running | blocked | waiting_user | done`.
- `review.open_critical_high`: count per round. The loop compares the last two values for the
  "growing count" escalation.
- `gates.G1`: one entry per escalation, `{ "round": 3, "answer": "one more round", "at": "…" }`.

## `review-r<N>/findings.json`

Cumulative: each round copies the previous file and updates it.

```json
[
  {
    "id": "A-3",
    "sources": ["architecture-reviewer"],
    "severity": "HIGH",
    "confidence": "high",
    "rule": "onion-architecture: routes call services only",
    "file": "server/src/modules/pulls/routes.ts",
    "symbol": "pullsRoutes",
    "line": 42,
    "summary": "routes.ts imports repository.ts directly",
    "status": "open",
    "route": "implementer",
    "decision_reason": null,
    "first_round": 1,
    "fixed_round": null,
    "reopened": 0
  }
]
```

- Field names `severity`, `file`, `line`, `rule`, `summary` match the reviewers' Findings JSON.
- `status`: `open | fixed | accepted | deferred | logged | rejected`.
- `route`: `main | implementer | test-writer | user`.
- `decision_reason`: required for `accepted`, `deferred` and `rejected`.
- The match key is `sources[0] + rule + file + symbol`; `line` is informational only.
