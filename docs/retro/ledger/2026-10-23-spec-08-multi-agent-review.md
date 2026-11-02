# Retro — spec-08-multi-agent-review (2026-10-23)

Session `1977627a-545d-4e6e-8cc6-d87709bd6bb6` · mode deep · 13 agents · max concurrency 3

⚠️ **Read this first.** This run shipped SPEC-08 (Multi-Agent Review) on branch
`feat/multi-agent-review`, PR [#18](https://github.com/Sotvorenniy/dev-digest/pull/18),
merged into `main`. **After** that merge, a separate merge commit
(`7d9294d`, "merge: sync L07-lab-hw into feat/multi-agent-review", pushed 2026-11-02 15:07
+01:00, authored outside this conversation — not by any action in this session's own tool
log) folded the sibling SPEC-09 "Export to CI" feature (worktree B, merged earlier via PR #17)
into the same branch tip. Every number in this document is scoped to **this run's own
commit**, `ebf8c2c` (`feat(reviews): multi-agent review trigger, grouping and comparison UI`),
diffed against its true base `3b6f16a` (`L07-lab-hw` at the time this branch was cut) —
**not** against `origin/main` (which now contains unrelated history from both features plus
later merges and no longer isolates this run) and not against the current branch tip (which
mixes in SPEC-09). A raw `git diff` against `main` or against the post-sync tip will show
roughly double these line counts because it is counting two features at once.

## Cost — tool metrics (token counts, `retro.mjs analyze --mode deep`)

Totals **for the whole session to date** (all agents, this run plus later activity in the same
chat): input processed 59.18M · cache read 56.38M (95%) · cache write 2.79M · output 395.5k ·
turns 410 · tool calls 646. The table below is the same tool's per-agent breakdown; rows 1-13
are this run (spec → plan → implement → verify → review → docs → self-review → PR); row 0 (main
session) also includes later, out-of-scope activity (see note below the table).

| # | Agent | Start | Turns | Input processed | Cache read | Output | Peak ctx | Tool calls | Denied | Duration |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | main session (whole chat to date) | +0 s | 196 | 43.88M | 97% | 149.0k | 457.8k | 173 | 0 | 14840.1 min |
| 1 | spec-creator: Write multi-agent review spec | +185.0 min | 27 | 2.30M | 88% | 46.5k | 139.6k | 59 | 0 | 44.1 min |
| 2 | implementation-planner: Plan multi-agent review implementation | +225.5 min | 51 | 5.74M | 96% | 61.6k | 201.0k | 109 | 0 | 14.1 min |
| 3 | implementer: Implement phase 1 server | +244.8 min | 19 | 1.08M | 93% | 18.2k | 77.6k | 46 | 0 | 10.4 min |
| 4 | implementer: Implement phase 2 client | +255.5 min | 26 | 1.41M | 90% | 35.9k | 97.7k | 86 | 1 | 69.7 min |
| 5 | plan-verifier: Verify code vs plan, scope code | +327.5 min | 11 | 608.3k | 86% | 9.4k | 89.6k | 30 | 0 | 1.9 min |
| 6 | architecture-reviewer: Architecture review round 1 | +330.6 min | 7 | 261.7k | 81% | 4.7k | 49.6k | 16 | 0 | 41 s |
| 7 | test-writer: Write tests for multi-agent review | +332.4 min | 29 | 2.25M | 89% | 41.9k | 126.9k | 42 | 2 | 15.8 min |
| 8 | plan-verifier: Final plan verification | +348.9 min | 18 | 666.6k | 91% | 8.5k | 57.3k | 33 | 1 | 1.8 min |
| 9 | security-reviewer: Security review multi-agent change | +352.4 min | 5 | 148.9k | 73% | 4.6k | 40.8k | 10 | 0 | 39 s |
| 10 | doc-writer: Document multi-agent review | +353.7 min | 7 | 269.7k | 81% | 9.3k | 52.2k | 26 | 0 | 1.1 min |
| 11 | general-purpose: Self-review: react and next skills | +358.6 min | 4 | 149.2k | 66% | 1.8k | 51.4k | 4 | 0 | 38 s |
| 12 | general-purpose: Self-review: testing library skill | +358.6 min | 7 | 329.0k | 82% | 2.8k | 60.6k | 8 | 0 | 50 s |
| 13 | general-purpose: Self-review: fastify and zod skills | +358.6 min | 3 | 87.8k | 63% | 1.1k | 32.5k | 4 | 0 | 17 s |

The "wall clock 14840.1 min" (~10.3 days) and the 196 main-session turns reflect the **whole
chat**, including a ~2.5h session-setup block before the spec kicked off, a ~238h idle gap
between shipping the PR and the user returning to ask for this retro, and the retro itself —
not continuous agent work. Agents 1-13 ran inside a ~3h17m window (11:22-14:40 UTC, 2026-10-23).

## Cost — real USD (computed from per-turn `usage` in the raw subagent/main-session JSONL, not
estimated)

Anthropic first-party rates used (`claude-api` skill, cached 2026-10-06): Opus 5.5 $4/$20 per
MTok, cache write 5m $5.00 / 1h $8.00, cache read $0.20; Sonnet 5.5 $2/$10 per MTok, cache write
5m $2.50 / 1h $4.00, cache read $0.20.

| Agent | Model | Cost |
|---|---|---|
| spec-creator (3 turns total: draft Qs, write draft, apply approval+gaps) | Opus 5.5 | $7.57 |
| implementation-planner (2 turns: intake Qs, write plan) | Opus 5.5 | $9.28 |
| implementer Phase 1 (server + contracts) | Sonnet 5.5 | $2.17 |
| implementer Phase 2 (client; rate-limited mid-run, resumed) | Sonnet 5.5 | $5.43 |
| plan-verifier scope=code | Sonnet 5.5 | $1.52 |
| architecture-reviewer round 1 | Sonnet 5.5 | $0.67 |
| test-writer | Sonnet 5.5 | $3.37 |
| plan-verifier scope=final | Sonnet 5.5 | $0.90 |
| security-reviewer | Sonnet 5.5 | $0.44 |
| doc-writer | Sonnet 5.5 | $1.12 |
| pr-self-review: react+next skills | Sonnet 5.5 | $0.24 |
| pr-self-review: react-testing-library skill | Sonnet 5.5 | $0.40 |
| pr-self-review: fastify+zod skills | Sonnet 5.5 | $0.21 |
| **13 subagents, subtotal** | | **$33.31** |
| Orchestrator (main session), turns inside the 11:22-14:40 run window only | Sonnet 5.5 | $13.73 |
| **Run total (spec → merged PR)** | | **≈ $47.05** |

By phase: spec + plan (both Opus 5.5) **$16.85** (36% of the subagent total) · implementation
(2 phases) **$7.60** · tests **$3.37** · reviews (2× plan-verifier, architecture, security)
**$3.53** · docs **$1.12** · self-review skill checks **$0.85** · orchestrator **$13.73**.
Orchestrator overhead (pure reading/relaying/bash verification, no code written) is close in
size to the entire spec+plan cost and bigger than implementation+tests+reviews+docs combined.

The orchestrator's cache is **1-hour TTL** (`cache_creation.ephemeral_1h_input_tokens`,
$8/MTok); every subagent's is **5-minute TTL** (`ephemeral_5m_input_tokens`, $5/MTok) — a real,
log-verified split, not a guess, consistent with a long top-level session needing to survive
user think-time versus a subagent that finishes in minutes.

**Measured cost of one interruption.** Implementer Phase 2 (agent `aa356e7`) was cut by a
provider rate limit and resumed via `SendMessage` after a 3508s (58 min) gap — longer than its
5-minute cache TTL. Split at the resume point: before the cutoff, 176,271 cache-write + output
tokens cost $1.63; after the resume, 286,628 cache-write tokens (now a cold rewrite, not a cheap
read) plus the rest of the work cost $3.80. Had the gap been under 5 minutes, those 286,628
tokens would have been a $0.20/MTok read (~$0.06) instead of a $2.50/MTok write (~$0.72) — about
**$0.66** of this run's cost is directly attributable to the rate-limit-forced cache cold start,
not to any agent's work.

## Theoretical savings — what following the recommendations would have bought

`.claude/agents/README.md` "Token-efficient hand-offs" and this run's own `retro.mjs` candidate
actions (full list in the report JSON) give two different answers depending on which
recommendation:

**Already followed, no more headroom there.** One implementer run per phase (3, as planned, not
1 big run) · reviewers given the pre-built bundle instead of reconstructing the diff
file-by-file · model picked by step (Opus only for spec-creator and implementation-planner,
Sonnet for every other agent) · `plan-verifier` scope=`final` re-checking only the delta since
scope=`code` instead of redoing everything · architecture-reviewer's round-1 findings reused via
`bundle.mjs reuse` at the final `/pr-self-review` gate instead of a second architecture pass.
These are exactly what the house guidance asks for, and they were already in place — re-reading
that guidance would not have changed this run.

**Not fully followed, with a real but small ceiling.** `retro.mjs` flagged 8 individual
over-wide `Read` results (26.5k, 37.6k, 48.6k ×2, 22.6k, 30.2k, 25.4k, 21.6k bytes — ≈ 261 KB,
≈ 65k tokens at ~4 bytes/token) that a narrower `offset`/`limit`/`grep` read would have avoided,
plus 7 files each re-read 3-4× by different agents that a shared "Context" section in the plan
(or a review-bundle entry) would have supplied once. Both are real, tool-flagged, line-item
findings. Translated to dollars: almost all of that is **cache-read** tokens (the cheapest tier
on both models, $0.20/MTok) — even a generous estimate that half of the 65k+ bytes were pure
waste comes to roughly **$0.01-0.03** saved, not a meaningful fraction of the $47 total. The
honest conclusion: these are real, fixable inefficiencies (see Proposals below, several marked
`now`), but they are not where this run's money went.

**Where the money actually went, and whether it's avoidable.** Two Opus-tier agents
(spec-creator + implementation-planner, $16.85, 36% of subagent spend) and the orchestrator
itself ($13.73) account for roughly two-thirds of the whole run's cost, and neither is a
"recommendation was skipped" problem: the repo's own written policy
(`.claude/agents/README.md` § "Pick the model by the step") deliberately keeps spec-creation and
planning on Opus because a wrong call there is expensive and hard to catch later — this run's
cost is the price of that insurance, not a miss. The orchestrator's $13.73 is mostly 1-hour
cache writes over 234 turns of a single, never-reset session driving 13 agents end to end
through `/run-plan`'s 8 stages; the only real lever on that number is structural (checkpoint the
run across shorter sessions, or hand stages to a sub-orchestrator) rather than anything an
individual agent did differently. **Bottom line: following every "now" proposal below would
save on the order of a few cents of this run's $47, not a double-digit percentage** — the
multi-agent pipeline's cost is dominated by its two deliberately-expensive planning steps and
the orchestrator's own session length, not by waste in the delegated work.

## Timeline

- +185 min: 1 spec-creator (asks blocking questions first; resumed twice more after answers and
  after the approval + 5 gap-fix instructions — 3 turns total inside one agent).
- +226 min: 2 implementation-planner (asks execution-mode + spec-readiness questions first;
  resumed once with answers to write the actual plan; single-agent mode, 3 implementer phases,
  cap requested by the user).
- +245 min: 3 implementer Phase 1 (server + both vendored contract copies).
- +256 min: 4 implementer Phase 2 (client) — cut by a provider rate limit after 53 turns, resumed
  via `SendMessage` 58 minutes later for 51 more turns; orchestrator applied the sanctioned
  `client/src/vendor/ui/nav.ts` edit itself in the main session (Phase 3), since the implementer
  path guard denies all vendor edits except the paired `shared` contracts.
- +328 min: 5 plan-verifier (scope=code) — COMPLETE, 19/19 ACs code-met, 0 not-met.
- +331 min: 6 architecture-reviewer (round 1) — PASS, 0 findings.
- +332 min: 7 test-writer — found and the orchestrator fixed one real bug (an i18n lookup key
  used the uppercase wire enum against lowercase message keys, `MISSING_MESSAGE`).
- +349 min: 8 plan-verifier (scope=final) — INCOMPLETE on 2 items (AC13's active-tab assertion,
  AC19's post-merge-with-worktree-B half, which cannot be checked from one branch); orchestrator
  re-ran the server integration suite itself to close a 3rd item the agent could only "read, not
  execute" (its Bash guard denies the `--it` flag form it needed).
- +352 min: 9 security-reviewer — 1 LOW (per-request regrouping cost on the new read endpoint,
  accepted, documented).
- +354 min: 10 doc-writer — wrote `server/docs/multi-agent-review.md`, set SPEC-08 to
  `implemented`.
- +359 min: 11, 12, 13 three `general-purpose` skill reviewers for `/pr-self-review`, in
  parallel (react+next, react-testing-library, fastify+zod) — 3 LOW findings total, all fixed by
  the orchestrator directly (no `implementer` round needed).
- Orchestrator then found and fixed 2 environment-only CRITICALs outside any agent's scope
  (client `tsc` failing on a phantom `@codemirror/*` dependency, onion-gate reporting 5
  false-new violations) — both traced to `node_modules` having been installed with pnpm's
  isolated linker instead of the repo's own `.npmrc: node-linker=hoisted`; reinstalling with a
  standalone pnpm@10 fixed both with zero code change. Re-ran `/pr-self-review`: PASS, 1 LOW.
  Committed, pushed, opened PR #18 against `L07-lab-hw`.

## Per-agent insights

### main session (orchestrator)
- Hard: carrying 13 agents' full reports verbatim through the conversation, start to finish,
  across ~3h17m of wall clock without ever resetting context.
- Easy: every `AskUserQuestion`-equivalent batch (relaying spec-creator's and
  implementation-planner's blocking questions) was answered by the user in one message each,
  with "accept all recommended" doing most of the work.
- Duplicated: read `specs/multi-agent-review.md`, `.claude/agents/README.md`,
  `.claude/plans/multi-agent-review.md` and `client/INSIGHTS.md` 3× each over the session
  (`retro.mjs` "duplicate-context").
- Missed: didn't verify before writing to `.dependency-cruiser-known-violations.json`-adjacent
  tooling that the environment's `node_modules` linker mode matched the repo's `.npmrc` until
  the 2 CRITICALs forced the investigation; could have checked `node-linker` at the first
  `pnpm install` instead of after a full review cycle.

### spec-creator (3 internal turns)
- Hard: `devdigest-review` worktree access denied ("outside the working directories") on the
  first run; had to redo its research in the orchestrator's own worktree.
- Easy: every blocking question came back answered in one shot ("all recommended"); the 2nd
  revision pass (approve + 4 gap fixes) took only 14 tool calls.
- Duplicated: re-read `server/src/vendor/shared/contracts/platform.ts` and
  `server/src/modules/reviews/service.ts` across its own 3 internal turns.
- Missed: nothing attributable — it flagged its own open questions (OQ1-OQ6) instead of
  guessing, exactly as designed.

### implementation-planner (2 internal turns)
- Hard: 51 turns / 201k peak context / 5.74M input processed for one plan — the single most
  expensive agent in the run.
- Easy: once the spec was `approved` and the gaps fixed, writing the 613-line, 14-step plan
  (single-agent mode, 3 phases) was one pass with no further back-and-forth.
- Duplicated: `server/src/modules/reviews/service.ts` and
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx`
  each read 3× in its own internal turns.
- Missed: nothing attributable — its intake report correctly blocked on "spec is `draft`" and
  "no execution mode chosen" rather than guessing either.

### implementer Phase 1 (server + contracts)
- Hard: nothing structural; clean single pass, 19 turns.
- Easy: both vendored contract copies ended up byte-identical on the first attempt (verified by
  `diff`, confirmed again by every later agent).
- Duplicated: one `.claude/plans/multi-agent-review.md` Read at 48.6k bytes (whole-file, not
  offset/limited).
- Missed: left the new server tests unwritten (`server/test/multi-agent-grouping.test.ts`,
  `*.it.test.ts`) — correct per its own path-guard (new test files are denied), not a miss, but
  worth noting it was planned and deferred to `test-writer` by design.

### implementer Phase 2 (client; rate-limited, resumed)
- Hard: cut mid-run by a provider rate limit after 53 turns; resumed 58 minutes later, past its
  own 5-minute cache TTL, so the second half paid a cold cache-write instead of a cheap read
  (see Cost above).
- Easy: the component move (`RunTraceDrawer`, `FindingCard` → `client/src/components/`) via
  `git mv` + `Edit` went through clean in one pass.
- Duplicated: re-read `.claude/plans/multi-agent-review.md` 3× across the two internal turns.
- Missed: new view/helpers tests (`MultiAgentConfigureView`, `MultiAgentResultsView`,
  `hooks/multi-agent.ts`) were explicitly left for `test-writer` — by instruction, not an
  oversight.

### plan-verifier ×2 (scope=code, scope=final)
- Hard: scope=code could not save its full AC-evidence matrix to a file (no Write tool by
  design) and said so plainly rather than silently truncating.
- Easy: scope=final re-checked only the 3 items it was told changed since scope=code, instead of
  redoing all 19 ACs.
- Duplicated: `.claude/plans/multi-agent-review.md` read without offset/limit in both runs
  (48.6k and part of the 666.6k processed in scope=final).
- Missed: scope=final flagged 2 real gaps the orchestrator had to close by hand — AC13's active
  Live-log-tab assertion was never written, and AC19's post-worktree-B half is structurally
  outside what a single-branch run can verify.

### architecture-reviewer (round 1)
- Hard: nothing; 7 turns, PASS.
- Easy: worked entirely from the review bundle (`summary.md` + `diff/<pkg>.patch`) with no
  further exploration needed.
- Duplicated: one 22.6k-byte Read not offset-limited.
- Missed: none found in its own pass; its "not verified" section correctly flagged that it did
  not check for a circular import between the two touched contract files, which turned out not
  to be an issue.

### test-writer
- Hard: 29 turns / 126.9k peak context to write both server and client test suites from
  scratch, including one true bug hunt.
- Easy: once written, every new test passed first run except the one it deliberately left red
  (the i18n bug) to prove it caught something real.
- Duplicated: `.claude/plans/multi-agent-review.md` read 4× across the run.
- Missed: nothing — this is the one agent whose report explicitly separated "found a real bug,
  fixed nothing, left the test red on purpose" from everything else, which is exactly the
  behaviour wanted from a test-writer.

### security-reviewer
- Hard: nothing; 5 turns, 39s.
- Easy: 1 LOW finding (per-request regrouping cost), accurately scoped to "changed lines only."
- Duplicated: one 30.2k-byte Read not offset-limited.
- Missed: none attributable.

### doc-writer
- Hard: nothing; 7 turns.
- Easy: wrote `server/docs/multi-agent-review.md` plus the `docs/README.md` index line and set
  `specs/multi-agent-review.md` to `implemented` in one pass.
- Duplicated: `server/src/modules/reviews/domain.ts` re-read across the run (shared with
  plan-verifier and test-writer — a `preload-shared` candidate).
- Missed: correctly deferred the `specs/README.md` index-line edit to the orchestrator (outside
  its path guard), and said so.

### general-purpose ×3 (`/pr-self-review` skill reviewers)
- Hard: nothing; 3-7 turns each, run in parallel as the skill requires.
- Easy: all 3 found only LOW issues (an Escape/`aria-expanded` gap in the new popover, a
  repeated-querystring 422-vs-400 mismatch, 2 stale test comments/anti-pattern `querySelector`
  calls) — every one fixed by the orchestrator directly, no `implementer` round needed.
- Duplicated: none flagged between them (disjoint skill scopes).
- Missed: none attributable.

## Code changes (this run only, `ebf8c2c` vs its true base `3b6f16a` — see the warning banner)

`git diff --shortstat 3b6f16a ebf8c2c` → **96 files changed, 3070 insertions(+), 107
deletions(-)**. By category (`git diff --numstat`, renames resolved to their post-rename path):

| Category | Files | + | − | What, and why |
|---|---|---|---|---|
| Contracts (both vendored copies, server + client) | 6 | 50 | 14 | `RunRequest.agent_ids`; new `AgreedBy`; `FindingRecord` +4 attribution fields; `AgentColumn`/`Conflict`/`MultiAgentRun` shape changes (AC1, AC16, AC17) |
| Server production code (`reviews` module) | 4 | 341 | 5 | New pure `domain.ts` (grouping, attribution, conflicts); `service.ts`/`routes.ts`/`helpers.ts` wiring for the subset trigger and the new read endpoint |
| Server tests | 2 | 535 | 0 | `multi-agent-grouping.test.ts` (hermetic, AC16/17) + `multi-agent-review.it.test.ts` (Docker, AC1-3/9/12/17) |
| Client new routes (`/multi-agent`) | 27 | 1315 | 0 | Configure + Results pages and their child components (columns, tabs, conflicts, score ring, view toggle) |
| Client moved shared components | 30 | 14 | 9 | `RunTraceDrawer` + `FindingCard` relocated from the PR route's `_components/` to `client/src/components/` so the new route can mount them without a cross-route import |
| Client existing-page edits (popover, PR page, app-shell) | 11 | 205 | 69 | `RunReviewDropdown` rebuilt as a checkbox popover; PR page wiring; sidebar `nav.test.tsx` |
| Client hooks/lib | 7 | 146 | 7 | New `multi-agent.ts` hook (4s poll while running), `useAgentsStats`, type re-exports |
| Client nav (sanctioned vendor edit) | 1 | 1 | 0 | One `GLOBAL` entry added to `client/src/vendor/ui/nav.ts`, before `agent-performance` |
| i18n message files | 2 | 29 | 3 | New strings for the popover, Configure/Results pages, conflicts section |
| Docs (server + client) | 3 | 80 | 0 | `server/docs/multi-agent-review.md`, both `docs/README.md` index lines |
| `client/INSIGHTS.md` | 1 | 19 | 0 | 2 findings captured (i18n-casing bug; checkbox-popover + `FindingCard`-collapsed test pattern) |
| Spec + spec index | 2 | 335 | 0 | `specs/multi-agent-review.md` (SPEC-08) + `specs/README.md` |
| **Total** | **96** | **3070** | **107** | |

A `git diff` against `origin/main` or against the current (post-sync) branch tip will not
reproduce this table — see the warning banner.

## Proposals

| Priority | Target | Change | Evidence | Status |
|---|---|---|---|---|
| now | `.claude/agents/implementation-planner.md`, `test-writer.md`, `implementer.md` | Read `.claude/plans/<slug>.md` once, by section (`grep -n "^## "` then offset/limit), not whole-file on every internal turn. | re-read 3-4× each in implementation-planner, implementer Phase 2, test-writer (`retro.mjs duplicate-context`) | open |
| now | `implementation-planner.md` §2 Context lines | Inline the 9 files `retro.mjs` flagged as `preload-shared` (each read by 3-4 agent types independently) as verified facts in the plan, instead of leaving every agent to re-derive them. | `platform.ts`, `service.ts`, `routes.ts`, `observability.ts`, `runs.json`, `RunReviewDropdown.tsx`(+`.test.tsx`), `pulls/domain.ts`, `reviews/domain.ts` each read 3-4× across agents | open |
| now | orchestrator habit (this skill, `run-plan`) | Before the first `pnpm install` of a run, check `node-linker` in `.npmrc` matches the actual installed layout (`ls node_modules/.pnpm` vs `ls node_modules/<direct-dep>`); don't wait for a CRITICAL to surface it. | 2 CRITICALs (client `tsc`, onion-gate) both root-caused to a linker-mode mismatch, found only after a full review cycle | open |
| next run | `.claude/agents/spec-creator.md`, `implementation-planner.md` | Narrow the 5 flagged oversized `Read`s (22.6k-48.6k bytes) with `offset`/`limit` or a targeted `grep` first. | `retro.mjs big-result`, 8 instances, ≈261 KB total | open |
| idea | `.claude/skills/run-plan/SKILL.md` | For a rate-limit interruption mid-implementer-run, note in the resume brief whether the gap exceeded the subagent cache TTL (5 min), so the cost of the cold restart is visible, not silent. | implementer Phase 2: $0.66 of this run's cost traced to a 58-minute resume gap | open |
| idea | `.claude/agents/plan-verifier.md` | Allow (read-only) `diff <file1> <file2>` on the readonly-bash-guard allowlist for exact byte-identity checks the vendored-contract-sync verification needs, instead of eyeballing two `git diff` outputs. | plan-verifier scope=code: "I compared the two git diff outputs by eye" (no `diff` on its allowlist) | open |
