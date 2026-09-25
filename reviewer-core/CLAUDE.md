# reviewer-core (@devdigest/reviewer-core)

## Before answering
Search `reviewer-core/docs/`, `reviewer-core/specs/`, `reviewer-core/INSIGHTS.md` first.
Read `reviewer-core/INSIGHTS.md` before working here and name the entries that apply. Treat them as high-confidence guidance.

## Conventions (not obvious from code)
- Pure by contract: no DB, GitHub or filesystem. The only side effect is the **injected** `LLMProvider` — that is what keeps it mock-testable, so a new runtime dependency is a design error.
- The package never emits JS: `build` is a type-check and the server consumes `src/` directly through a tsconfig path alias.
- Prompt slots (`skills`, `memory`, `specs`, `callers`) are optional by design — omitted slots simply drop out of the assembled prompt.

## Do not touch
- `reviewer-core/src/grounding.ts` behavior — the citation gate is mandatory; loosening it lets hallucinated line references through.

## Use when
- Pipeline, public API, testing → read `reviewer-core/README.md`
- Deep-dives and design notes → read `reviewer-core/docs/`
- Findings and gotchas → read `reviewer-core/INSIGHTS.md`
- Recalling prior findings, or wrapping up a task → run `/engineering-insights`
