---
name: skill-eval
version: 1.0.0
description: "Runs a skill's eval: N agents with the skill and N without it (baseline) get the same prompt, each report is graded by a separate grader agent against the answer key, and the with/without delta is reported against the eval.md thresholds. Use only when the user types /skill-eval <skill>. Needs evals/skills/<skill>/audit/eval.md and expected-findings.json (legacy location: .claude/skills/<skill>/evals/). Does NOT write evals (see skill-evals/_shared/README.md) and does not edit the skill under test."
disable-model-invocation: true
---

# Skill eval

This is the **real-repo, tool-using** eval (with-skill vs baseline, blind-graded). The isolated, judge-scored
skill cases and the statistics tools (`eval:repeat`, `eval:delta`, `eval:benchmark`) live in the `evals/` package;
use those for skill *content* quality and use this for end-to-end behaviour on the real repo.

Manual only: runs when the user types `/skill-eval <skill>`. One run = `runs_per_side × 2`
runner agents plus the same number of graders (12 for 3 runs). That is more than the default
workflow size guideline of 10, so tell the user the agent count before launching and wait for
a yes.

```
evals/skills/<skill>/audit/{eval.md, expected-findings.json} ──► args ──► Workflow "skill-eval" ──► result JSON ──► report
                                      (.claude/workflows/skill-eval.js)
```

## Steps

1. **Read** `evals/skills/<skill>/audit/eval.md` and `expected-findings.json` (fall back to the legacy `.claude/skills/<skill>/evals/` if the new folder is missing; the key must live outside the skill folder). Stop with a clear message if either is missing.
2. **Build `args`** (JSON, not a string):
   - `skill` — folder name.
   - `prompt` — the text of the "Task prompt" block, without the `>` quote marks.
   - `runs` — `runs_per_side` from the frontmatter (default 3).
   - `facts` — `[{id, pass_if}]` from `must_find`. Only these; never the `uncertain_not_penalised` list.
   - `rubric` — the "Structure rubric" list from `eval.md` as strings. If the eval has no rubric, pass `[]`.
   - `thresholds` — `{recall, structure}` from the frontmatter.
3. **Call** `Workflow({name: 'skill-eval', args})`. Runners and graders use Sonnet; never Fable.
4. **Write** the returned JSON to `.devdigest/cache/skill-evals/<skill>/result.json` (git-ignored) and print the report below.
5. **Do not edit** the skill or the key from a result. Propose changes and let the user decide.

## Report (fixed order)

1. **Verdict** — pass/fail against thresholds, one line.
2. **Table** — recall (majority and per run) and structure (mean and per run), for both sides, plus the delta.
3. **Per fact** — found-in `x/N` for both sides; list facts only one side finds.
4. **False statements** — per side, with the run number.
5. **Caveats** — always: N runs per side, graders are models, isolation is by instruction only, tokens and time are not measured by the workflow (read them from the task notifications if needed).

## Rules

- Graders see the key; runners never do. Do not paste the key into a runner prompt.
- A fact needs a literal `pass_if`. If a fact is vague, say so in the report instead of guessing.
- If a run was lost (`runs_lost > 0`), say so and do not hide it in the means.
- Do not change a key after seeing baseline output just to make the skill win. Add a new fact and re-run instead.
