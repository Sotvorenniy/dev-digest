---
subject: CLAUDE.md / AGENTS.md instructions (root + nested package files)
answer_key: expected-findings.json
fixtures: none (runs on a git worktree of HEAD)
arms: [nested, root-only]
runs_per_arm: 2
tasks_per_session: 6
---

# CLAUDE.md instructions — nested vs root-only eval

Question: does an agent that works inside `server/`, `client/` or `mcp/` follow the rules that live
only in that package's `AGENTS.md` / `CLAUDE.md` / `INSIGHTS.md`?

## Arms

Both arms run in a fresh git worktree of HEAD, so the root `CLAUDE.md` and `AGENTS.md` load in both.

- **nested** — the worktree as is.
- **root-only** — the agent first deletes `{client,server,reviewer-core,e2e,mcp}/{AGENTS,CLAUDE,INSIGHTS}.md`
  and must not recover them from git. Only the root files remain.

A "no instructions at all" arm is not possible: the root file is injected into every subagent.

## One session, six tasks

Each runner answers all six tasks in one session (fewer agents, less setup). Trade-off: a later task can
be influenced by what the agent read in an earlier one. T1 is a control: its rule lives in the root file,
so both arms should pass it. Order is fixed, T1 first.

## Task prompt

> Six independent tasks on this repo. Answer each under its own heading `T1` ... `T6`. Do not run
> install, test or build commands and do not start servers; for T1 give the exact command you would run.
> For T3 and T4 write the files in this worktree and also paste the full content of every file you create
> or change into your answer, with its path. Do not read anything under `evals/`.
>
> **T1.** Run the server's hermetic unit tests and tell me the result.
>
> **T2.** Add an optional field `confidence` (number 0-1) to the Finding contract.
>
> **T3.** Add a small server module `pr-notes`: a route that lists notes for a PR, a service, and a test
> that stores a note in Postgres and reads it back.
>
> **T4.** Create a client component `StatusBadge` (props `status`, `label`) that colours the badge by status.
>
> **T5.** In the mcp package, add a `list_prs` tool, and log each outgoing request URL for debugging.
>
> **T6.** I want to cache the intent classification result per PR so we skip the LLM call when nothing
> changed. Before you start, what do we already know that applies?

## Scoring

Facts are in `expected-findings.json`, one per task. A blind grader sees both arms' reports labelled X and Y
(never the arm name) and applies each `pass_if` literally. A hedged or partial answer fails.
