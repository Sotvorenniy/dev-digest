# e2e (@devdigest/e2e)

## Before answering
Search `e2e/docs/`, `e2e/specs/`, `e2e/INSIGHTS.md` first.
Read `e2e/INSIGHTS.md` before working here and name the entries that apply. Treat them as high-confidence guidance.

## Conventions (not obvious from code)
- Flows are deterministic: locators are `--url`, `--text`, `find role|text|label` only. The AI `chat` command is never used, so runs need no key and no LLM.
- `wait --text` / `wait --url` **are** the assertions — a non-zero exit fails the step.
- Flows assume the seeded demo repo is the only repo, so run the hermetic stack rather than your dev DB.

## Do not touch
- `docker compose down -v` — it deletes the dev volume and every imported repo; the hermetic runner is the safe reset.

## Use when
- How to run, env knobs, coverage table → read `e2e/README.md`
- Flow scenarios → read `e2e/specs/*.flow.json`
- Findings and gotchas → read `e2e/INSIGHTS.md`
- Recalling prior findings, or wrapping up a task → run `/engineering-insights`
