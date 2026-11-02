# evals (@devdigest/evals)

Evals of this repo's own Claude Code harness: skills (`.claude/skills/*`), subagents (`.claude/agents/*`) and
CLAUDE.md-driven workflow. vitest + Claude Agent SDK, runs on the Claude Code login — no API key.

## Before answering
Search `evals/README.md`, `evals/docs/` first. There is no `evals/INSIGHTS.md` yet; add one with `/engineering-insights` when a non-obvious finding appears.

## Conventions (not obvious from code)
- A case is data: `skills/<name>/<name>.eval.ts` (the run), `<name>.cases.ts` (prompts + expectations), `fixtures/` (untrusted test data). Fixtures never go inside `.claude/skills/<name>/`, or the model can read the planted problem as guidance.
- Three tiers: `pnpm eval:quality` (static, no model) · `eval:skills` / `eval:agents` (isolated content, LLM-judged) · `eval:workflow` (real harness, trace-asserted). `eval:repeat`, `eval:delta`, `eval:benchmark` read `results/records.jsonl`.
- Every path a workflow case asserts must exist in THIS repo; the upstream template pointed at docs of its sample repo.
- Answer keys for end-to-end runs live in `evals/skills/<skill>/audit/` and `evals/instructions/<name>/`, never in the skill folder.

## Do not touch
- `evals/results/` — git-ignored run records.
- `evals/package.json` / `pnpm-lock.yaml` by running `pnpm install` blindly: with pnpm 12 it rewrote `openai` to `^6.0.0` and exited 1 on the `esbuild` build-script prompt. Check `git diff evals/package.json evals/pnpm-lock.yaml` after any install.

## Use when
- Install, tiers, runners (Claude Code vs OpenRouter), statistics → read `evals/README.md`
- Statistics design → read `evals/docs/eval-stats-upgrade.md`
