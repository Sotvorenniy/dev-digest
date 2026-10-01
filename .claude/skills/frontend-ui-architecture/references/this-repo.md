# dev-digest `client/` conventions

These are the conventions actually in force in this repository. Where they disagree with the
generic guidance in `SKILL.md`, **these win** — they are observable in the code, not aspirational.

Authoritative sources: `client/AGENTS.md`, `client/docs/architecture.md`, `client/INSIGHTS.md`,
root `AGENTS.md`. Read `client/INSIGHTS.md` before working in the package, as the root guide
requires.

## Contents

- [A component is a folder](#a-component-is-a-folder)
- [Nested `_components/`: a different set of rules](#nested-_components-a-different-set-of-rules)
- [Two folder-casing zones](#two-folder-casing-zones)
- [Route-level files](#route-level-files)
- [There is no `utils/`](#there-is-no-utils)
- [Hooks live in two places](#hooks-live-in-two-places)
- [One data path](#one-data-path)
- [Styling: no Tailwind](#styling-no-tailwind)
- [Vendored packages](#vendored-packages)
- [i18n, test hooks, path aliases](#i18n-test-hooks-path-aliases)
- [Where this repo diverges from generic advice](#where-this-repo-diverges-from-generic-advice)

## A component is a folder

Not "once it grows" — here it is the default shape. This section describes a **top-level**
component folder: one directly under `client/src/components/` or under a route's
`_components/`. Sub-components nested *inside* one of those follow different rules — see
[Nested `_components/`](#nested-_components-a-different-set-of-rules).

Always present in a top-level component folder:

- `Name.tsx` — the component
- `styles.ts` — always `export const s`
- `index.ts` — re-exports **both** named and default

Added when needed: `Name.test.tsx`, `constants.ts`, `helpers.ts`, `types.ts`, `hooks/`.

The fullest example is `client/src/components/findings-popover/`:

```
findings-popover/
├── FindingsPopover.tsx
├── FindingsPopover.test.tsx
├── constants.ts
├── helpers.ts
├── styles.ts
├── types.ts
└── index.ts
```

`styles.ts` is an object of `CSSProperties`, with geometry imported from `./constants` and all
colors as CSS variables:

```ts
import type { CSSProperties } from "react";
import { PANEL_WIDTH } from "./constants";

export const s = {
  panel: { position: "fixed", width: PANEL_WIDTH, background: "var(--surface)" } satisfies CSSProperties,
};
```

`index.ts` shapes vary across the codebase and all three are in use — match the neighbours of
the folder you are adding to:

```ts
export { AgentCard, AgentCard as default } from "./AgentCard";          // most common
export { FindingsPopover, default } from "./FindingsPopover";           // plus types and styles
export * from "./AppShell";                                             // barrel-style
```

Every file opens with a `/* … */` block comment stating its purpose **and the reason for the
design**, and helpers carry JSDoc explaining *why*. Follow that — it is consistent across the
package and is how non-obvious layout decisions are recorded.

## Nested `_components/`: a different set of rules

A component folder may contain its own `_components/`. This is used in four places:

```
app/agents/_components/AgentsListView/_components/
app/agents/[id]/_components/AgentEditor/_components/
app/settings/[section]/_components/SettingsView/_components/
app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/
```

The nested children deliberately do **not** repeat the top-level folder shape. Match this, not
the generic rule:

| | Top-level component folder | Nested `_components/` child |
|---|---|---|
| `styles.ts` | its own | **none** — imports `../../styles` from the parent |
| `constants.ts` / `helpers.ts` | its own | **none** — lives at the parent root |
| `index.ts` | named **and** default | **named only** |
| Test | its own `Name.test.tsx` | tested through the parent |

So `RunTraceDrawer/` owns one `styles.ts`, one `constants.ts` and one `helpers.ts` for its
whole subtree, and each child is just `Child.tsx` + `index.ts`:

```
RunTraceDrawer/
├── RunTraceDrawer.tsx          orchestration only
├── RunTraceDrawer.test.tsx
├── constants.ts                for the whole subtree
├── helpers.ts                  for the whole subtree
├── styles.ts                   one `export const s`, sectioned by comments per child
├── index.ts                    named + default + props type
└── _components/
    ├── TraceBody/              TraceBody.tsx + index.ts  (no styles.ts)
    ├── TraceSection/           owns its own collapse state
    ├── ToolCallRow/            owns its own expand state
    ├── PromptBlock/
    ├── PromptModalBody/
    ├── FindingsSection/
    └── atoms.tsx               bare file — see below
```

A child's `index.ts` is one line: `export { TraceBody } from "./TraceBody";`

**The bare-file escape hatch.** Several trivial presentational components with no logic may
share one flat `.tsx` file instead of each getting a folder — `RunTraceDrawer/_components/atoms.tsx`
holds `Stat` and `Row` and says why in its header comment: *"no logic, never tested alone."*
Use this when the components are pure layout and would never be tested or reused
independently; a folder each would be ceremony. Anything with state, a handler or a branch
gets a folder.

**Component-scoped `hooks/`.** One file per hook, named for the hook
(`useGlobalShortcuts.ts`), plus an `index.ts` barrel re-exporting them —
`client/src/components/app-shell/hooks/` is the only existing example and the one to copy.
Place `hooks/` at the component folder's root, not inside `_components/`, so parent and
children can both consume it.

## Two folder-casing zones

| Location | Folder case | File case |
|---|---|---|
| `client/src/app/**/_components/` | `PascalCase` | `PascalCase` |
| `client/src/components/` | `kebab-case` | `PascalCase` |

So `app/agents/_components/AgentCard/AgentCard.tsx` but
`components/findings-popover/FindingsPopover.tsx`. Getting this wrong is the most common
review comment on new client code.

## Route-level files

`styles.ts`, `constants.ts` and `helpers.ts` also sit **beside `page.tsx`** at a route, not only
inside component folders:

```
client/src/app/repos/[repoId]/pulls/
├── page.tsx
├── styles.ts
├── constants.ts
├── helpers.ts
├── _components/          # PRRow/, FilterBar/
└── [number]/             # nested route, its own _components/
```

Route-local children go in `_components/`. Dynamic segments are named for their entity when a
route nests several: `[repoId]/pulls/[number]`.

Pages are thin and mostly `"use client"`; the RSC work lives in `app/layout.tsx` (locale +
messages). Every screen renders inside `<AppShell crumb={…}>` with `PageContainer` from
`src/components/page-shell`.

## There is no `utils/`

Shared non-hook logic lives as flat, topic-named modules in `client/src/lib/`:

```
client/src/lib/github-urls.ts
client/src/lib/model-label.ts
client/src/lib/latest-reviews.ts      (+ latest-reviews.test.ts)
client/src/lib/feature-models.ts
```

Do not create `client/src/utils/`. Add a named module instead.

**Helpers and constants are never centralized** — they are colocated, every time, in all seven
places they exist. This matches the generic rule in
[code-placement.md](code-placement.md); note it as a confirmed pattern, not a coincidence.

## Hooks live in two places

- **Global data hooks** → `client/src/lib/hooks/`, with `index.ts` as the barrel:
  `core.ts` (settings, secrets, repos, pulls, project context), `agents.ts`, `reviews.ts`
  (React Query + SSE), `trace.ts`, `repo-intel.ts`.
- **Component-scoped hooks** → a `hooks/` folder inside the component folder. The only current
  example is `client/src/components/app-shell/hooks/` (`useGlobalShortcuts`, `useShellCommands`,
  `useShellContext`).

Long-running work polls with a conditional `refetchInterval` — 4s while any run is `running`,
`false` otherwise.

## One data path

```
client/src/lib/api.ts          apiFetch → api.get / post / put / patch / del
        ↓
client/src/lib/hooks/*         TanStack Query hooks
        ↓
components
```

**Never call `fetch` directly from a component — add a hook instead.** This is stated as a rule
in `client/docs/architecture.md`, and it is what keeps error handling uniform.

`apiFetch` normalizes every failure into `ApiError { status, code, details }`; a network
failure is `status: 0`. Error UX follows from that taxonomy (`src/lib/providers.tsx`):
mutations always toast; queries toast only on status 0 or ≥500, so expected 4xx responses
drive inline empty states instead of noise.

Query defaults: `retry: 1`, `staleTime: 30_000`, no refetch on focus. Provider stack is
QueryClient → Theme → Toast → Repo.

The active repo resolves URL `:repoId` > `localStorage["dd-repo"]` > first repo from
`useRepos()`. Use `useActiveRepo()`; do not re-derive it from the pathname.

## Styling: no Tailwind

Styling is **inline style objects** via `styles.ts`, and colors are **only** CSS variables
(`var(--accent)`, `var(--text-muted)`, `var(--border)`). There are no Tailwind utilities in app
code.

Theming is `data-theme` on `<html>`, set before paint by `themeNoFlashScript`
(`src/lib/theme.tsx`), persisted to `localStorage["dd-theme"]`.

## Vendored packages

- `@devdigest/ui` → `client/src/vendor/ui`. Import **only from the barrel**, never a layer file.
  A new or changed `@devdigest/ui` component must be added to the showcase or the smoke test
  fails.
- `@devdigest/shared` → `client/src/vendor/shared`. **Type-only in the client.** A runtime-value
  import pulls `vendor/shared/index.ts` into the webpack bundle and its `./contracts/*.js`
  re-exports fail to resolve. This is why `client/src/lib/feature-models.ts` hand-mirrors the
  server registry.
- Do not edit anything under `client/src/vendor/**` — they are copies, not sources. The client
  and server copies of `shared` have already drifted; a contract change means editing both or
  neither.

## i18n, test hooks, path aliases

- **i18n** — next-intl, single locale `en`, no locale routing. One file per namespace at
  `client/messages/en/<ns>.json`, camelCase keys nested by UI surface, new files picked up
  automatically. **User-facing strings never go inline in JSX.**
- **Test hooks** — semantic `data-<thing>` attributes, never `data-testid` (there are none):
  `data-finding-id`, `data-severity-pill`, `data-findings-trigger`.
- **Path aliases** — declared in **both** `client/tsconfig.json` and `client/vitest.config.ts`.
  Update both or tests break: `@/*` → `./src/*`, `@devdigest/shared` →
  `./src/vendor/shared/index.ts`, `@devdigest/ui` → `./src/vendor/ui/index.ts`.
- `noUncheckedIndexedAccess` is on — `list[0]!` is the house idiom here, not sloppiness.

## Where this repo diverges from generic advice

| Generic advice | Here |
|---|---|
| Promote a component to a folder when it grows | A top-level component is a folder from the start, with `styles.ts` + `index.ts` |
| Every component folder owns its styles | Nested `_components/` children share the parent's `styles.ts` and export named-only |
| A component is always a folder | Trivial logic-free presentational components may share one bare `.tsx` (`atoms.tsx`) |
| Tailwind or CSS modules | Inline style objects; colors only as CSS variables |
| `src/utils/` for shared helpers | No `utils/`; named modules in `src/lib/` |
| `features/` directory | Feature code lives under its route in `src/app/**/_components/` |
| `data-testid` for test hooks | Semantic `data-<thing>` attributes |

Note that the `react-best-practices` skill contains a Tailwind section and a
`useApiQuery`/`useApiMutation` data-fetching convention. **Neither applies to this
repository** — this file is correct for `client/`.
