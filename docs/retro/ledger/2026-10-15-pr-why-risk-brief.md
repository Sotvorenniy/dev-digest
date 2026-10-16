# Retro — pr-why-risk-brief (2026-10-15)

Session `57b0fb4a-bc28-453f-ba91-cf6fc323c4c7` · mode quick · 16 agents · 224.6 min

Quick mode: subagent rows come from the task-notification `<usage>` block. They leave out any agents a child spawned, and they have no cache split. "Tokens" is the one number the notification reports.

## Cost

| Agent | Tokens (notification) | Tool calls | Duration |
|---|---|---|---|
| main session | 17.65M input · 65.6k output | 97 | 224.6 min |
| spec-creator (3 resumes) | 153.5k | 24 | 1.3 min* |
| implementation-planner (1 resume) | 400.4k | 13 | 5.1 min* |
| cross-model plan review (Sonnet) | 176.2k | 23 | 18.6 min |
| implementer P1 | 75.5k | 32 | 3.7 min |
| implementer P2 | 71.1k | 32 | 3.2 min |
| implementer P3a | 52.0k | 32 | 3.7 min |
| implementer P3b | 56.2k | 54 | 2.4 min |
| plan-verifier (code) | 90.8k | 31 | 1.8 min |
| architecture-reviewer r1 | 51.3k | 27 | 48 s |
| security-reviewer r1 | 50.6k | 23 | 52 s |
| test-writer | 189.0k | 102 | 19.3 min |
| plan-verifier (final) | 46.0k | 21 | 1.1 min |
| doc-writer | 65.1k | 37 | 1.3 min |
| self-review React+Next | 65.0k | 5 | 41 s |
| self-review client tests | 61.2k | 7 | 46 s |
| self-review server | 58.3k | 4 | 22 s |

\* Duration and tokens are those of the last resume. The first planner run was about 355k tokens, 144 tool calls and 16 min.

The subagents used about 1.7M tokens in total, so the main session is about 90 % of input processed. The previous deep run, onboarding-tour, processed 24.54M; that figure is not directly comparable because it came from deep mode.

## Timeline
0 main
→ 1 spec-creator (questions) → user answers → 1 resumed (draft) → 1 resumed (OQs) → 1 resumed (two deltas from the homework text, which arrived in parts)
→ 2 implementation-planner (16 min) → 3 cross-model review on Sonnet (18.6 min) → 2 resumed (revise for F1–F7)
→ commit spec and plan
→ 4–7 implementer P1 → P2 → P3a → P3b, sequential because each phase is one writer
→ 8 plan-verifier (code) → 9, 10 architecture- and security-reviewer in parallel
→ 11 test-writer (19.3 min) → 12 plan-verifier (final) → 13 doc-writer
→ engineering-insights (main) → 14–16 self-review agents ×3 in parallel → verdict PASS
→ commit → push failed: no GitHub credentials and no `gh`

## Per-agent insights
### main session
- Hard:
  - Bookkeeping cost about 10 Bash calls: reports, `state.json` and `findings.json`.
  - Two of those calls failed: a `sed` on multi-line JSON, and a `grep --include` glob under zsh.
  - The working directory drifted twice, to `server/` and to the plan folder, and had to be reset before spawning a writer.
  - The review scope fought the bundle: `bundle.mjs` and `route.mjs` diff against `origin/main` and pulled in 276 files of unreviewed lab work. Scoping took a hand-made `feature-files.txt` and a user question.
  - The verdict went STALE after the commit, because the run-state files were added to the tree.
  - The push failed at the very end.
- Easy: intake (R0), phase hand-offs, merging the round-1 findings (LOW only), and the insights flush.
- Duplicated: every agent report was relayed twice, once restated for the user and once saved by hand into `reports/*.md`.
- Missed:
  - A push preflight. Missing `gh` and missing HTTPS credentials could have been detected at intake.
  - Gathering the full homework text before starting spec-creator. Two requirements arrived after approval and forced a spec revision and a resume.

### spec-creator
- Hard: four rounds. Two were caused by the orchestrator: it passed the screenshots late and the homework text late.
- Easy: blocking questions with recommended options let the user answer in one line ("accept all recommended").
- Duplicated: none.
- Missed:
  - It correctly refused to set `approved` itself.
  - The spec is now behind the plan in two places: the extra `BriefTruncated` fields and the head-SHA fix in `pulls/routes.ts`.

### implementation-planner
- Hard: the first pass took 144 tool calls and about 16 min. It was the largest single subagent.
- Easy: the revision for 16 findings took 13 calls.
- Duplicated: none observed.
- Missed:
  - It went beyond the spec: the `truncated.callers` and `truncated.blast_summary` fields.
  - It flagged this itself, but nothing routed the gap back into the spec.

### cross-model review (Sonnet)
- Hard: 18.6 min, with more than 40 anchors spot-checked.
- Easy: none recorded.
- Duplicated: it re-verified anchors the planner had already cited.
- Missed: nothing. It found the only HIGH of the run (stale head SHA with a token), and that finding drove a real fix. High value per token.

### implementers ×4
- Hard: none.
- Easy:
  - 52–76k tokens and 2–4 min per phase, with every check passing first time.
  - The F5 phase split worked. The previous run had a 7.8M single implementer.
- Duplicated: none.
- Missed:
  - P3a left the focus props unwired. That was by design and handed over correctly.
  - Severity CSS variables were unverified until the main session ran one grep.

### plan-verifier ×2
- Hard: none.
- Easy:
  - Fast: 46–91k tokens.
  - Scope `final` re-checked only the test items, as the token rule asks.
  - `--with-tests` gave COMPLETE on the first pass. This confirms the 2026-10-14 proposal ("turn `--with-tests` on").
- Duplicated: none.
- Missed: it has no Write tool, so the "full matrix in a scratch file" request could not be met.

### architecture- and security-reviewer
- Hard: none.
- Easy: about 50k tokens each, under 1 min, run in parallel, LOW findings only.
- Duplicated: none.
- Missed:
  - Neither flagged the test-quality issues: mocked own children, assertions that cannot fail.
  - That is outside their scope. Self-review caught them later.

### test-writer
- Hard:
  - 102 tool calls and 19.3 min.
  - Much of it went into bisecting pre-existing `reviews.it` failures with temporary worktrees and a copied `.env`.
- Easy: none recorded.
- Duplicated: the conventions-rescan and `reviews.it` failures were already recorded in `server/INSIGHTS.md` under "Recurring Errors & Fixes".
- Missed:
  - It did not apply that INSIGHTS entry before investigating.
  - It wrote `page.test.tsx` and `OverviewTab.test.tsx` by mocking the app's own child components. That broke its own react-testing-library rule ("mock at boundaries"), and self-review raised it as a MEDIUM.

### doc-writer
- Hard: none.
- Easy: about 65k tokens, 1.3 min.
- Duplicated: none.
- Missed: `e2e/README.md` and `server/README.md` are outside its write scope. The main session added the e2e row by hand. The `server/README.md` API map was not updated.

### self-review ×3
- Hard: none.
- Easy: 4–7 tool calls each, cheap.
- Duplicated: none. The reuse of `reviews.json` removed the already-reviewed skills.
- Missed: none.

## Effect of earlier proposals
- Path guards using the repo root (done 2026-10-14): no guard denials this run, even after the cwd drifted.
- `--with-tests` (open, used by hand): final verify COMPLETE first time, with no catch-up run.
- A `state.mjs` helper (open): still needed. About 10 hand-written JSON bookkeeping calls, 2 of them failed.
- "Never `cd <pkg> &&`" (idea): broken twice this run.

## Proposals
| Priority | Target | Change | Evidence | Status |
|---|---|---|---|---|
| now | `.claude/skills/run-plan/SKILL.md` R0 | Record `base_sha = HEAD` at intake in `state.json`. Pass it to `bundle.mjs` and pr-self-review (`PR_SELF_REVIEW_BASE`) so the reviews see only this run's changes. | The bundle diffed 276 files (lab work included); `feature-files.txt` and a user question were needed | done — R0 records `base_sha`; bundle, review-loop, pr-self-review and the G2 push use `PR_SELF_REVIEW_BASE=<base_sha>`; schema updated |
| now | `.claude/skills/run-plan/SKILL.md` R0 | Add a push preflight: `gh` on PATH, plus `git push --dry-run` or a credential check. Report a failure at intake, not at G2. | Push failed after the PASS verdict: "could not read Username" | done — R0 `push_ready` preflight (`gh`, `gh auth status`, credential helper; warns, never pushes); G2 hands the user the push command when false |
| now | `.claude/agents/test-writer.md` | (a) Before investigating a failure outside your files, check `<pkg>/INSIGHTS.md` "Recurring Errors" and stop if it is listed. (b) Never mock the app's own child components; mock hooks and network only. | 102 calls and 19 min, partly on known `reviews.it` failures; self-review MEDIUM on `page.test.tsx` | done — `test-writer.md` Step 4: known failures from INSIGHTS reported as known, no bisecting; Step 3: never mock own components or assert passed props |
| next run | `.claude/skills/run-plan/` | `state.mjs` helper (carried over from 2026-10-14). | About 10 bookkeeping calls, 2 failed | open |
| next run | `pr-self-review` `route.mjs` / `verdict.mjs` | Exclude `.claude/plans/**` run-state from the content hash, or commit run state before the verdict. | Verdict went STALE after committing reports and `state.json` only | open |
| next run | `pr-self-review` `gate.sh` | Read the base from the stored verdict, not only from the `PR_SELF_REVIEW_BASE` env var, so the hook and the pre-push hook agree with a non-default base. | The push needed a manual env prefix; the Claude hook does not see it | open |
| next run | run-plan, after the plan review | When the plan goes beyond the spec (new fields, extra files), route a one-line spec revision to spec-creator before code. | The spec still lacks the `truncated.callers`/`blast_summary` fields and the `pulls/routes.ts` fix | open |
| idea | orchestrator habit | Collect the whole task text, screenshots included, before starting spec-creator. | 4 spec-creator rounds, 2 caused by late inputs | open |
| idea | `.claude/agents/doc-writer.md` | Allow package `README.md` API maps, or list them for the main session in the report. | `server/README.md` API map was not updated; e2e row done by hand | open |
| idea | cross-model review brief | Cap the anchor spot-check at about 15 and ask for findings first, to cut the 18.6 min. | 176k tokens and 18.6 min; it found the only HIGH, so keep the step | open |
