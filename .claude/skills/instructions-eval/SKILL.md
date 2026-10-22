---
name: instructions-eval
version: 1.0.0
description: "Measures what the nested package CLAUDE.md / AGENTS.md / INSIGHTS.md files add on top of the root ones: two arms (nested, root-only) work in git worktrees, answer several tasks in ONE session each, and a blind grader scores both against the answer key. Use only when the user types /instructions-eval <name> (for example claude-md). Needs evals/instructions/<name>/eval.md and expected-findings.json. Does NOT test skills (use skill-eval) and does not edit instruction files."
disable-model-invocation: true
---

# Instructions eval

Manual only. Default budget: **2 runs × 2 arms = 4 runner sessions + 2 graders = 6 agents**, all on Sonnet,
six tasks per runner session. State the agent count and wait for a yes if the eval asks for more than 6.

```
evals/instructions/<name>/eval.md + expected-findings.json ──► args ──► Workflow "instructions-eval" ──► report
```

## Steps

1. Read `evals/instructions/<name>/eval.md` and `expected-findings.json`. Stop with a clear message if missing.
2. Build `args` (real JSON): `name`; `prompt` = the "Task prompt" block without `>` marks; `runs` (cap at 2 unless the user asks for more);
   `facts` = `[{id, task, pass_if}]` from `must_find`; `arms` = `[{name:'nested', setup:''}, {name:'root-only', setup:'<rm command from eval.md>'}]`.
3. Call `Workflow({name: 'instructions-eval', args})`.
4. Write the result to `.devdigest/cache/instructions-eval/<name>/result.json`.
5. Report: score per arm and the delta; per-fact table (hits per arm); facts where arms differ; false statements; caveats.
6. Clean up: runner worktrees that changed are kept. List them with `git worktree list` and offer to remove them; never remove one without asking.

## Rules

- The runner prompt contains no answer key. `evals/` is untracked/not in the worktree; if the folder is ever committed, the runners could read it, so say so.
- A control task whose rule lives in the root file should pass in both arms. If it does not, flag the run as suspect.
- Tasks share one session: say in the report that order effects are possible.
- Do not change a key after seeing results to make an arm win; add a fact and re-run.
