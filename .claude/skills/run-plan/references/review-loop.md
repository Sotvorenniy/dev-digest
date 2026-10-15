# R3 — Review and fix loop

Goal: leave R3 with no open CRITICAL or HIGH finding and a recorded decision for every MEDIUM,
in at most `max_review_rounds` rounds (default 3).

```
round = 1
loop:
  bundle → review (arch ∥ security) → merge findings → triage → fix → checks
  exit if clean · escalate if a stop condition hits · else round++
```

## 1. Build the input

```bash
PR_SELF_REVIEW_BASE=<base_sha> node .claude/skills/pr-self-review/scripts/bundle.mjs write   # base_sha from state.json
cp .devdigest/cache/review-bundle/hashes.json .claude/plans/<slug>/review-r<N>/hashes.json
```

The bundle (`summary.md`, `diff/<pkg>.patch`, mechanical gates with the onion gate) is the
reviewers' input; they cannot run `git` or depcruise. `write` deletes the old `reviews.json`, so
round N's reviews are saved to `review-r<N>/` as well (step 3).

Round 2+: list the files touched since the previous round and save them to
`review-r<N>/touched-files.txt`:

```bash
P=.claude/plans/<slug>
jq -r --slurpfile old $P/review-r<N-1>/hashes.json \
  '.files as $new | ($new + $old[0].files) | keys[] | select($new[.] != $old[0].files[.])' \
  $P/review-r<N>/hashes.json
```

## 2. Review (parallel)

Send both Agent calls in **one message**:

- `architecture-reviewer` and `security-reviewer`, each with: the plan path, the spec path,
  `.devdigest/cache/review-bundle/summary.md`, and on round 2+ `touched-files.txt` plus the open
  finding IDs with `path:line` and rule.
- Ask for: the findings table only, a "confirmed fixed: <ids>" line and a "still open: <ids>"
  line. Passing areas collapse to one line ("checked and clean: …").
- Round 2+: "Review only the files in `touched-files.txt` and confirm the open findings. Do not
  re-review untouched files."
- Skip a reviewer in round 2+ when none of its findings is open and the touched files hold
  nothing in its area (for example a client-only rename for `security-reviewer`).

`architecture-reviewer` runs on `sonnet`. If a round looks shallow (a CRITICAL area in the bundle
with "checked and clean" and no evidence), re-run that reviewer once with `model: "opus"` on the
Agent call; do not change the default.

## 3. Merge into `findings.json`

Save both "Findings JSON" blocks as a JSON array to `.devdigest/cache/review-bundle/reviews.json`
(for `/pr-self-review`) and to `review-r<N>/reviews.json`. Then update the cumulative
`review-r<N>/findings.json` (copy of the previous round's file; schema in
[`state-schema.md`](state-schema.md)).

A finding's **match key** is `agent + rule + file + symbol` (the nearest function, component or
export; `line` is left out because it shifts after edits).

- New key: new ID (`A-<n>` architecture, `S-<n>` security, `P-<n>` pr-self-review), `status: open`, `first_round: N`.
- Known key, reviewer says fixed (or the finding is absent while its file was re-reviewed): `status: fixed`, `fixed_round: N`.
- Known key with `status: fixed`, reported again: `status: open`, `reopened + 1`. This is **oscillation**.
- Same defect from both reviewers: one entry, both agents in `sources`.

## 4. Triage

| Severity | Action |
|---|---|
| CRITICAL, HIGH | Must fix. No user question unless the fix contradicts the plan or spec (see 5). |
| MEDIUM | Ask the user **every round** with `AskUserQuestion`, max 4 findings per call. Options: **Fix now**, **Accept** (one-line reason), **Defer** (listed in the final summary as follow-up). Accepted and deferred findings are not asked again unless reopened. |
| LOW | `status: logged`. No fix, no question. |

A CRITICAL with confidence `medium`: read the cited lines yourself before routing. If the failure
scenario does not hold, set `status: rejected` with the reason and tell the reviewer next round.

## 5. Route each fix

| Condition | Route |
|---|---|
| Fix changes behaviour or scope (contradicts the spec) | Stop the loop. Ask the user; the spec is revised by hand with `spec-creator`. |
| Fix contradicts a plan step (wrong layer, wrong contract) | Stop the loop. Ask the user; the plan is amended by hand with `implementation-planner`, then `/run-plan <slug> --from review`. |
| One-line or mechanical (rename, move a constant, `import type`, a guard) | Main session fixes directly. |
| Code change within plan scope | `implementer` with `review-r<N>/fix-brief.md`. |
| Fix needs a test change | With `--with-tests`: `test-writer` after the implementer. Without: `implementer` keeps existing tests green only; note the gap in the summary. |

`fix-brief.md` lists for each finding: ID, severity, `path:line`, rule, the reviewer's evidence,
the expected outcome and the plan step or AC it belongs to. The implementer treats it as the
phase to execute and must not widen scope beyond it.

## 6. Checks

Run `.claude/scripts/check-changed.sh <touched pkgs>`. A failure goes back to the same writer
before the next review round; it does not count as a round.

## 7. Exit and escalation

Exit R3 when no finding is `open` with severity CRITICAL or HIGH, and every MEDIUM is `fixed`,
`accepted` or `deferred`.

**Gate G1** — stop and ask the user when any of these holds:

- `round > max_review_rounds` with an open CRITICAL or HIGH;
- a finding has `reopened >= 1` (two fixes undo each other);
- the open CRITICAL + HIGH count is higher than in the previous round;
- the two reviewers ask for contradictory fixes on the same lines.

G1 options: **One more round**, **Accept and continue** (each open finding gets a reason),
**Stop for re-planning** (the user re-runs `implementation-planner`), **Stop the run**.
