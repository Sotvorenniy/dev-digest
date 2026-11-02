# Run analysis: Export to CI (SPEC-09)

Branch `emdash/export-to-ci-30ln8`, commit `ed48e41`, PR #17 (base `L07-lab-hw`).
Raw logs: [`export-to-ci-run-logs/`](export-to-ci-run-logs/).

## 1. What was built
One agent can be deployed to one repo's GitHub Actions from a new CI tab on the agent editor.
A 4-step wizard (Target, Preview, Configure, Install) previews the generated files and opens
a PR. GitHub Actions only; no ingest, no CI Runs page, no zip, no GitHub App.

## 2. Pipeline and timeline
Exact numbers (workflow-retro, deep mode; "input processed" = uncached + cache write + cache read):
| # | Stage | Agent | Turns | Input processed | Output |
|---|---|---|---|---|---|
| 0 | all | main session | 100 | 14.19M | 62.9k |
| 1 | Spec | `spec-creator` | 30 | 2.16M | 54.6k |
| 2 | Plan | `implementation-planner` | 45 | 4.50M | 53.8k |
| 3 | Build P1 | `implementer` | 17 | 927.6k | 17.8k |
| 4 | Build P2 | `implementer` | 20 | 852.0k | 25.1k |
| 5 | Verify (code) | `plan-verifier` | 10 | 479.0k | 8.7k |
| 6 | Review r1 | `architecture-reviewer` | 5 | 174.2k | 4.6k |
| 7 | Review r1 | `security-reviewer` | 5 | 110.3k | 6.1k |
| 8 | Verify (final) | `plan-verifier` | 4 | 58.5k | 2.6k |
| 9 | Self-review | client react/next skills | 3 | 95.4k | 3.9k |
| 10 | Self-review | server db/fastify/zod skills | 5 | 160.2k | 2.3k |
| 11 | Fix loop 1 | `implementer` | 11 | 320.8k | 10.0k |
| 12 | Review r2 | read-only re-review | 6 | 226.2k | 3.1k |
| | **Total** | 12 subagents + main | 261 | **24.24M** (cache read 95%) | **255.6k** |

Main session = 58% of all input; subagents = 10.05M. Implementer budget: 3 of 5 used. Fix loop:
1 of 2 iterations, 1 of 2 subagents. No dollar figure: pricing and per-agent model were not recorded.
Raw wall clock (14547 min) includes a ~10 day pause; active time was ~2.4 h (day 1) + ~0.5 h (day 2).
Earlier drafts of this doc quoted 826k "subagent tokens" taken from completion notices; that figure
is not input processed and is replaced by the table above. Full retro: [ledger entry](ledger/2026-11-02-export-to-ci.md).

## 3. Friction (what cost time or tokens)
1. **Spec agent could not read the target worktree.** `blockReadsOutsideWorkingDirectories`
   blocked `devdigest-ci`; the first spec run produced only questions, and its facts came from
   `main`. Fixed by fast-forwarding this worktree to L07 and deleting the duplicate worktree.
2. **Planner intake round-trip.** The first planner run ended with 5 questions and no plan; the
   second wrote it. Mode and the YAML/dialog/rate-limit choices could have been given up front.
3. **No `node_modules` in a fresh worktree.** The implementer could not run checks or generate
   the migration. The main session installed dependencies.
4. **`pnpm` ignored `.npmrc` (`node-linker=hoisted`).** The default isolated layout caused a
   dependency-cruiser baseline mismatch (5 false "new" violations) and missing `@codemirror/*`.
   Fixed with `pnpm install --frozen-lockfile --node-linker=hoisted` in `server` and `client`.
5. **Session rate limit** interrupted the Phase 2 implementer once; resumed without loss.
6. **Migration regeneration blocked by a hook.** The implementer deleted its own unapplied
   `0017` files, then the hook refused a hand-edit of `_journal.json`. The main session reverted
   that tracked file with `git checkout` and ran `drizzle-kit generate`.
7. **Self-review re-did work.** Two extra agents (81k tokens) reviewed files that round 1 had
   already covered with other skills; they found the real client bugs, so the cost was not wasted.
8. **`state.json` timestamps are placeholders** (`2026-10-23T00:00:00Z`), written by hand.

## 4. Findings and decisions
- Round 1: 0 critical, 0 high; medium (runner from PR branch runs with the API key) accepted and
  documented in the PR body text; slug-length cap, `styles.ts` in step folders, `.nullish()` vs
  `.nullable()` deferred.
- Self-review: 4 medium. Fixed: stale `prUrl` after Back, broken focus trap from step 2, silent
  step-1 errors, workspace scoping (`workspace_id` + `(workspace_id, repo)` unique index).
- Round 2: 4/4 confirmed. Deferred low: Preview not regenerated after Configure, focus after
  install, `ExportBody` narrowing in the route, silent `ci_fail_on` save error.
- Final gate: `/pr-self-review` PASS (0/0/0 and 4 low).

## 5. Code-change statistics
Measured against the branch base `3b6f16a` (L07), not `main`.

| Scope | Files | Added | Deleted |
|---|---|---|---|
| vs branch base `3b6f16a` | 44 | 6,122 | 10 |
| vs `main` (`178b53b`) | 265 | 31,101 | 86 |

The "+7,800" seen earlier cannot be reproduced from `git diff`: this branch gives +6,122 against
its base. If the PR page shows a different number, check its base branch.

What the 6,122 added lines are:
| Part | Lines | Note |
|---|---|---|
| Generated `meta/0017_snapshot.json` | 4,194 | drizzle-kit output, 68% of the total; not hand-written |
| Spec `specs/2026-10-23-export-to-ci.md` | 284 | |
| Client UI (`CiTab` + wizard, 20 files) | 827 | |
| Server `modules/ci` | 601 | 8 files |
| `ci.json` i18n | 77 | |
| Server schema/adapter/container/journal/migration SQL | 61 added, 10 deleted | |
| INSIGHTS (3 files) | 34 | |
| Hooks, shared contract, nav wiring, README | ~42 | |

Hand-written production code is about 1,640 lines (UI 827 + server 601 + other wiring); with the
spec, i18n and INSIGHTS about 1,930. The only deleted lines (10) are in `server/src/db/schema/ci.ts`
(the old index and column rewrite); everything else is additive.

### File-by-file
Full per-file numbers: [`numstat-vs-L07-base.tsv`](export-to-ci-run-logs/numstat-vs-L07-base.tsv).
- `server/src/modules/ci/`
  - `service.ts` (157): export flow, validation, 409/422 rules, GitHub calls, upsert last.
  - `domain.ts` (130): slug and path guards, file generation, wire mapping.
  - `repository.ts` (103): installation queries and upsert, workspace-scoped.
  - `routes.ts` (61): the two routes, body schema, 10/min rate limit.
  - `ports.ts` (56): repository, GitHub, runner-bundle and log ports.
  - `workflow.ts` (40): fixed workflow template, fork skip, secrets by name.
  - `constants.ts` (28), `manifest.ts` (24): paths, PR text, JSON manifest.
- `server/src/adapters/runner-bundle/local.ts` (19): reads the pre-built runner bundle.
- `server/src/db/schema/ci.ts` (+29/-10), migration SQL (4 lines), `_journal.json` (7),
  `container.ts` (13), `modules/index.ts` (2): schema, migration and wiring.
- `client/.../CiTab/` (CiTab 121, styles 138, constants 41, helpers 28, wizard steps 508 in total):
  CI tab and the 4-step wizard with its own dialog shell.
- `client/src/lib/hooks/ci.ts` (29), `ci.json` (77), `AgentEditor` (2+1): data hooks, strings, tab registration.
- Both `eval-ci.ts` copies (+1 each): `pr_url`.

## 6. Not verified / open
- No new tests (user constraint); §5 of the plan is the follow-up list.
- Integration tests (`*.it.test.ts`, Docker) were not run.
- End-to-end needs a built `agent-runner/dist/index.js` and a real repo.
- Merge order: `feat/multi-agent-review` (SPEC-08) first; regenerate migration `0017` on conflict.

## 7. Theoretical token savings (estimate, not measured)
Base: 24.24M input processed. Cache reads are cheaper than fresh input, so the saving in cost is
smaller than in raw tokens. Rough effect of the top ledger proposals:
| Change | Avoided (input processed) | Share of 24.24M |
|---|---|---|
| Preflight deps + hoisted install before R1 (no blocked implementer, no detour in main) | ~1.0M | ~4% |
| Save `reviews.json` so self-review reuses round 1 (skip 2 agents) | ~0.26M | ~1% |
| Spec agent starts in the right worktree (no blocked first run) | ~0.7M | ~3% |
| Reviewers read bundle patches, exclude migration snapshot from the bundle | ~0.4M | ~2% |
| Smaller orchestrator context (reports as file paths, no relaying full reports) | ~2.0M | ~8% |
| **Total** | **~4.4M** | **~18%** |
Plausible range 12-22%. The biggest lever is the main session (14.19M); the subagent-side changes
are small by comparison. Cutting reviews would save more but would have missed 3 real client bugs.
