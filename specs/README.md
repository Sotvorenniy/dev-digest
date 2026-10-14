# specs — root

Cross-module specs only: a spec lands here when the feature touches **two or more** modules
(`server`, `client`, `reviewer-core`, `mcp`, `e2e`). A spec for one module lives in `<pkg>/specs/`.

Specs are written by the [`spec-creator`](../.claude/agents/spec-creator.md) agent before planning;
the `implementation-planner` takes a spec as input.

## Conventions
- File name: `YYYY-MM-DD-<feature-slug>.md`.
- `Spec ID: SPEC-NN` — one global sequence across root `specs/` and every `<pkg>/specs/`.
- `Status: draft | approved | implemented | superseded by SPEC-NN`. `spec-creator` writes `draft`; only the
  user sets `approved`; `doc-writer` sets `implemented` after the feature ships. `spec-creator` writes only
  its own spec file (hook-enforced), so the orchestrator applies `superseded by` and the index line below
  from its Spec Report.
- Unknowns are marked in place as `[NEEDS CLARIFICATION: <question>]`, never guessed. A spec with a marker
  left stays `draft`, and the ACs it touches are not planned.
- Ownership: spec content belongs to `spec-creator`. Other agents never edit acceptance criteria.
- Acceptance criteria use EARS (WHEN / WHILE / IF … THEN / WHERE, `(shall)` marks a mandatory requirement),
  about 15 per spec at most; a larger feature is split into several specs.
- Every spec has a Traceability table (AC → story → goal → covered edge cases / NFRs → verify lane from
  [`TESTING.md`](../TESTING.md) "Suite map"), Decisions and a Changelog. Item IDs (AC, EC, NFR) are never renumbered.
- Index line per spec: `- [SPEC-NN — <feature name>](<file>) — <status>`.
- Template and rules: [`spec-writing` skill](../.claude/skills/spec-writing/SKILL.md) (EARS, template, self-check) and
  [`.claude/agents/spec-creator.md`](../.claude/agents/spec-creator.md) (the agent's workflow).

## Index
- [SPEC-01 — Project Context](2026-10-14-project-context.md) — implemented
- [SPEC-02 — Onboarding Tour](2026-10-14-onboarding-tour.md) — implemented
