---
skill: dependency-checker
location: evals/skills/dependency-checker/audit/  # outside the skill folder, so the skill cannot read its own key
answer_key: expected-findings.json
fixtures: none (runs on the real repo)
cases: [repo-audit]
runs_per_side: 2
thresholds:
  recall: 0.8
  structure: 6
---

# dependency-checker — real-repo audit eval

Complements `../dependency-checker.cases.ts` (isolated, synthetic data, judge-scored). This one runs the skill
with tools on the real repo and is scored against `expected-findings.json`; run it with `/skill-eval dependency-checker`.

One case on the real repo. The key lists facts true when it was written; re-check them when a
`package.json`, lockfile or workflow changes. The first four facts are easy (visible in
`package.json`); the last four need a source scan and are where a baseline is expected to lag.

## Task prompt

The prompt names no report sections, so it does not hand the baseline the skill's structure.

> What is wrong with the dependencies in this repo, and what should we do about it?

## Run conditions

- Read-only: the agent must not edit files or run install, update or remove.
- Both sides get the same prompt and the same tool freedom. Run each side 2 times (token budget); score the
  mean per fact (a fact counts as found when it is in at least 1 of 2 runs).
- The without-skill run must not call the Skill tool or read `.claude/skills/dependency-checker/`.
- Neither run may read anything under `evals/` (answer key lives there).
- Isolation is by instruction until the runner exists (see `skill-evals/_shared/README.md`).

## Scoring

**Recall** — fraction of `must_find` facts the report states correctly. Each fact has a
`pass_if` rule in the key; apply it literally.

**Structure (0-8)** — see the rubric below; one point each: (1) Mermaid dependency graph; (2) internal edge
server → reviewer-core shown; (3) per-package size totals; (4) per-dependency sizes;
(5) own vs transitive size distinguished; (6) prioritised list with levels; (7) concrete fix per
finding; (8) a "not checked" or limits note (CVEs, bundle size).

Sizes are measured differently by `du` and by summed file bytes; accept either within the range
in `pass_if`.

**False statements** — list each claim that contradicts the repo. Report the count separately.

## Structure rubric

Machine-readable copy of the eight points; `/skill-eval` passes this list to the graders.

1. Mermaid dependency graph
2. Internal edge server → reviewer-core shown
3. Per-package size totals
4. Per-dependency sizes
5. Own vs transitive size distinguished
6. Prioritised list with levels
7. Concrete fix per finding
8. A "not checked" or limits note (CVEs, bundle size)
