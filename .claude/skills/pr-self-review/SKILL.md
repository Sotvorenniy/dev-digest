---
name: pr-self-review
version: 1.0.0
description: "Self-review of all LOCAL changes (commits since origin/main + staged + unstaged + untracked) before a pull request is opened. Routes every changed file to the project review skills that own it — UI skills on client files, backend/architecture skills on server files — runs the mechanical gates (onion depcruise, tsc, migration and test-naming rules), and writes a verdict that BLOCKS pushing, opening and merging the PR while any CRITICAL finding exists. Use this skill before every `gh pr create`, `git push` of a PR branch or `gh pr merge`; when the PR self-review gate hook blocks a command; and whenever the user says 'self review', 'review my changes', 'am I ready for a PR?', 'check before PR', 'can I open a PR', or runs /pr-self-review. Does NOT review someone else's PR on GitHub (use code-review) and does not fix code itself."
---

# PR Self Review

Reviews what is on this machine and not yet in a PR, with the skills the repo already
has, each on its own files. One CRITICAL finding → verdict `BLOCKED` → the gates refuse
`git push`, `gh pr create|merge|ready`, and the GitHub check `pr-self-review` stays red.

Everything that decides *what runs on what* is a script. The model only does the review
itself and the verification of CRITICALs.

```
route.mjs ──► plan.json ─┐
mechanical.mjs ──► mechanical.json ─┼─► verdict.mjs write ──► .devdigest/cache/self-review.json
skill agents ──► llm.json ──────────┘            │
                                   gate.sh (PreToolUse hook, git pre-push)
                                   publish-status.sh (GitHub commit status)
```

`S=.claude/skills/pr-self-review/scripts` and `C=.devdigest/cache/pr-self-review` below
(both relative to the repo root; `C` is git-ignored).

The base is `merge-base origin/main HEAD`. `PR_SELF_REVIEW_BASE=<ref>` overrides it (a PR
into another branch, or a test worktree) — pass a **sha**, not the branch you commit on:
committing moves that branch, the base moves with it, and the verdict turns `STALE`.

## Workflow

### 1. Plan — which skill sees which file
```bash
mkdir -p .devdigest/cache/pr-self-review
node $S/route.mjs > $C/plan.json
```
`plan.json` holds `base`, `head`, `dirty`, `diff_hash`, `files`, `skills` (skill → files),
`not_covered`, `excluded`. Routing comes from `routing.json`; do not add or drop skills by
judgement. If `files` is empty, say there is nothing to review and stop.

If the plan has more than ~1500 changed lines (`git diff --stat <base>`), say so and
suggest splitting the PR — then continue.

### 2. Mechanical gates
```bash
node $S/mechanical.mjs > $C/mechanical.json
```
Runs `onion-architecture/scripts/check.sh` (when `server/src` changed), `tsc --noEmit` per
changed package, and the repo rules (applied migrations are immutable, new `.sql` needs
its drizzle-kit meta, DB tests must be `*.it.test.ts`, vendored `shared` copies move
together, no `package-lock.json` in pnpm packages, `@devdigest/shared` is type-only in the
client). Severities are fixed there — do not re-judge them. `errors` means a gate could not
run (missing install): report it with the fix, the verdict becomes `INCOMPLETE`.

### 3. Context
Read `INSIGHTS.md` of every touched package (and the root one) — `AGENTS.md` requires it.
Pass the entries that apply to the files each agent reviews.

### 4. One review agent per skill, in parallel
For each `skill → files` in `plan.skills`, launch an `Agent` (read-only work; all agents in
**one** message). Merge skills whose file lists are identical or tiny so there are at most
~6 agents. Each prompt contains:

- the skill to apply: `.claude/skills/<skill>/SKILL.md` — read it, and its references only
  when a rule needs the detail;
- the rubric: `.claude/skills/pr-self-review/severity.md`;
- the files and how to see their change: `git diff <base> -- <files>` (untracked files: the
  whole file is new);
- the INSIGHTS entries that apply;
- the output contract — reply with **only** this JSON:
  ```json
  {"skill": "<skill>", "findings": [{"severity": "CRITICAL|HIGH|MEDIUM|LOW",
    "file": "client/src/…", "line": 42, "rule": "<rule/section name from the skill>",
    "summary": "…", "failure_scenario": "input/state → wrong result", "fix": "…"}]}
  ```
- the limits: added/changed lines only; stay inside that skill's scope; an empty list is a
  valid answer.

### 5. Verify every CRITICAL from the agents
A false CRITICAL blocks a merge, so each one is checked by you, not trusted: open the file
at that line, read enough surrounding code, and confirm the failure scenario is real and
introduced by this change. Not confirmed → set `"severity": "HIGH", "downgraded": true`
and add why to `summary`. Mechanical findings are not re-verified.

Save the agents' (verified) outputs as a JSON array to `$C/llm.json`.

### 6. Verdict
```bash
node $S/verdict.mjs write --plan $C/plan.json --mechanical $C/mechanical.json --llm $C/llm.json
```
It refuses if files changed during the review (hash mismatch) — rerun from step 1. It
prints the report; show it to the user as is, ending with the line
`PR SELF REVIEW: PASS | BLOCKED (N critical) | INCOMPLETE`.

For `BLOCKED`, list what to fix per CRITICAL. Do not fix code unless the user asks; after
fixes, the whole review runs again (the verdict is bound to the exact file contents).

### 7. GitHub status
```bash
bash $S/publish-status.sh
```
Posts `pr-self-review` = success/failure on HEAD. It skips (with a message) when `gh` is
missing, HEAD is not pushed, or the tree is dirty — then the `PostToolUse` hook publishes it
after the next `git push` / `gh pr create`. Never push or open the PR yourself unless the
user asked for it.

## Gates

| Where | What | Blocks |
|---|---|---|
| Claude Code `PreToolUse` (`.claude/settings.json`) | `gate.sh --hook` on `gh pr create\|merge\|ready`, `git push` | the command, until PASS for the current changes |
| git `pre-push` (`scripts/githooks`, enable with `scripts/install-hooks.sh`) | `gate.sh` | push from a terminal / IDE |
| GitHub | required status check `pr-self-review` on `main` | the merge button |

The verdict is bound to a content hash of every changed file, not to HEAD: committing the
reviewed content keeps it valid, changing any byte makes it `STALE`.

**Honest limits.** `git push --no-verify` skips the local hook, and the status is posted from
a local machine, so the GitHub check is team discipline, not protection against someone
determined to bypass it. Enabling the required check needs repo-admin rights (one-time,
Settings → Branches → `main` → require status check `pr-self-review`).

The Claude hook matches command **text** where a shell command starts (line start, or
after `;` `&&` `|` `(`). A quoted `"git push"` passes, but a heredoc line or a multi-line
command whose line begins with `git push` / `gh pr create` is blocked too. To test the
gate itself, run the probe from a script file rather than inline.

## Maintaining

- New review skill → add a rule to `routing.json` (or put it in `notReviewSkills`);
  `node --test .claude/skills/pr-self-review/scripts/*.test.mjs` fails until you do.
- New deterministic project rule → `repoRuleFindings` in `mechanical.mjs`, with a test.
