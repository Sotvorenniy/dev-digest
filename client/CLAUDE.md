# client (@devdigest/web)

## Before answering
Search `client/docs/`, `client/specs/`, `client/INSIGHTS.md` first.
Read `client/INSIGHTS.md` before working here and name the entries that apply. Treat them as high-confidence guidance.

## Conventions (not obvious from code)
- `@devdigest/shared` is **type-only** here — importing a runtime value pulls `vendor/shared/index.ts` into the webpack bundle and its `./contracts/*.js` re-exports fail to resolve. That is why `client/src/lib/feature-models.ts` mirrors the server registry by hand.
- A component is a folder: `Name.tsx` · `Name.test.tsx` · `styles.ts` (`export const s`) · `constants.ts` · `helpers.ts` · `index.ts`.
- Colors only as CSS variables; styling via inline style objects — no Tailwind utilities in app code.
- `noUncheckedIndexedAccess` is on — `list[0]!` is the house idiom, not sloppiness.
- A new or changed `@devdigest/ui` component must be added to the showcase, or the smoke test fails.
- TS path aliases live in **both** `client/tsconfig.json` and `client/vitest.config.ts` — update both.

## Do not touch
- `client/src/vendor/ui` and `client/src/vendor/shared` — vendored copies, not sources.

## Use when
- Stack, route map, commands → read `client/README.md`
- Design system layers and theming → read `client/src/vendor/ui/README.md`
- Data flow, providers, conventions in depth → read `client/docs/architecture.md`
- Findings and gotchas → read `client/INSIGHTS.md`
- Recalling prior findings, or wrapping up a task → run `/engineering-insights`
