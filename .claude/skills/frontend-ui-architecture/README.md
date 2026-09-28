# Frontend UI Architecture Skill

**Version 1.1.0** · first-party · created 2026-09-28

## Changelog

**1.1.0** — Fixes from the first smoke test, where an agent applied the skill to a real
refactor question and reported back on what it got wrong:
- `references/this-repo.md` claimed every component folder has its own `styles.ts` and an
  `index.ts` exporting named + default. False for nested `_components/` children, which share
  the parent's `styles.ts` and export named-only. Added a "Nested `_components/`" section with
  the comparison table, the `RunTraceDrawer/` layout, the `atoms.tsx` bare-file escape hatch
  and the shape of a component-scoped `hooks/` folder.
- Moved the "read `this-repo.md` first" pointer to the top of `SKILL.md`. It was second-to-last,
  after ~140 lines of generic advice that file then overrides.
- `SKILL.md` claimed severity tags were applied "per section" including the references; only its
  own sections carry them. Claim corrected rather than tags added.
- Added a note that the feature-boundary rule maps onto route segments in an App Router project,
  since this repo has no `features/` directory and a literal reading made the section look
  inapplicable.
- Made the `business-logic.md` pointer specific, so it is opened only for the two things
  `SKILL.md` does not already summarize.

**1.0.0** — Initial release.

## Motivation

Two frontend skills already ship in this repo, and neither answers architectural questions:

| Skill | Covers | Gap |
|---|---|---|
| `react-best-practices` | anti-pattern catalog — derived state, hooks misuse, memoization, keys, a11y, performance | architecture gets one 5-bullet section, "Code Organization (MEDIUM)" |
| `next-best-practices` | Next.js file conventions, async APIs, metadata, image/font optimization | says nothing about where project code lives or how features are bounded |

So the recurring questions on this project had no home: *where do components go, how should they
be split, where do constants live, what belongs in a helper versus a utility, where does
business logic sit, where do you draw module boundaries.*

This skill fills that gap and deliberately stays out of the other two. Its `description`
carries explicit negative scoping ("does NOT cover rendering performance… use
react-best-practices") so it does not compete for their triggers.

### Design decisions

| Decision | Reason |
|---|---|
| **Architecture only, no performance** | The overlap with `react-best-practices` is where a skill stops being useful. Colocation is recommended here for *maintainability*, with the re-render benefit left to the other skill. |
| **Portable rules + a repo-specific reference** | `SKILL.md` works in any React/Next project; `references/this-repo.md` codifies what `client/` actually does and takes precedence where the two differ. |
| **Progressive disclosure** | `SKILL.md` is a decision table plus short rules; the four topic references load only for the question at hand. |
| **Reasoning over mandates** | Each rule states *why*, because a model that understands the trade-off generalizes to cases the skill never listed. |

### Contents

```
frontend-ui-architecture/
├── SKILL.md                        rules + routing table
├── examples.md                     13 BAD/GOOD pairs
├── README.md                       this file
└── references/
    ├── component-anatomy.md        folder shape, when to split, props API
    ├── code-placement.md           constants, helpers vs utilities, types, barrels
    ├── business-logic.md           domain vs application logic, service vs hook, server state
    ├── nextjs-app-router.md        colocation, route groups, RSC boundary, DAL
    └── this-repo.md                dev-digest client/ conventions
```

This skill is **first-party — do not add it to `skills-lock.json`**, or the next sync will treat
it as drift and clobber it (same rule as `engineering-insights`).

## Sources

Every rule in the skill traces to one of these. Links were checked on 2026-09-28.

### Canonical documentation

- [Project structure and organization — Next.js](https://nextjs.org/docs/app/getting-started/project-structure) — The three official organization strategies, why colocation in `app/` is safe (a route is not public without `page`/`route`), private `_folder`, route groups `(folder)`, the `src` folder. Source for most of `nextjs-app-router.md`.
- [Server and Client Components — Next.js](https://nextjs.org/docs/app/getting-started/server-and-client-components) — `'use client'` as a module-graph boundary; Server Components can render Client Components but not the reverse.
- [Server and Client Boundary — Next.js](https://nextjs.org/docs/app/guides/server-and-client-boundary) — The `children`-passing pattern for rendering server content inside a client shell.
- [Data Security — Next.js](https://nextjs.org/docs/app/guides/data-security) — The Data Access Layer argument: one place that knows how data is fetched and what is safe to pass into the render context.
- [Thinking in React — react.dev](https://react.dev/learn/thinking-in-react) — Decomposing a UI into a component hierarchy; the single-responsibility framing for components.
- [Reusing Logic with Custom Hooks — react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks) — When logic becomes a hook, and the point that hooks let a component "express its intent, not the implementation."
- [You Might Not Need an Effect — react.dev](https://react.dev/learn/you-might-not-need-an-effect) — Derive during render instead of storing; Effects are for synchronizing with external systems, not for orchestrating data flow.

### Project structure methodologies

- [bulletproof-react — project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — The `features/` layout, the unidirectional rule `shared → features → app`, "don't import across features — compose at the application level", the ESLint config that enforces it, and the warning that barrel files hinder tree-shaking.
- [bulletproof-react (repo)](https://github.com/alan2207/bulletproof-react) — Full reference application for the above.
- [Slices and segments — Feature-Sliced Design](https://feature-sliced.design/docs/reference/slices-segments) — The import rule ("a slice can only import from layers strictly below"), zero-coupling/high-cohesion definition of a slice, and the `ui`/`api`/`model`/`lib`/`config` segment names with the advice to avoid `components`/`hooks`/`types`.
- [Feature-Sliced Design — overview](https://feature-sliced.design/docs/get-started/overview) — Layers/slices/segments as organization by scope, domain and technical purpose.
- [feature-sliced/documentation](https://github.com/feature-sliced/documentation) — Source repository for the methodology.
- [React Folder Structure Best Practices — Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/) — The progression from a flat structure to feature folders, and when each stage stops working.
- [Project Standards — React Handbook](https://reacthandbook.dev/project-standards) — Practitioner-level conventions for structure and module ownership.
- [How to structure your React projects — Sandro Roth](https://sandroroth.com/blog/project-structure/) — Comparison of type-based vs feature-based layouts with the trade-offs of each.
- [Next.js directory organization best practices — Sentry](https://sentry.io/answers/next-js-directory-organisation-best-practices/) — Hybrid feature + colocation layouts for App Router projects.

### Colocation

- [Colocation — Kent C. Dodds](https://kentcdodds.com/blog/colocation) — "Place code as close to where it's relevant as possible", and why colocation solves maintainability problems rather than just tidiness.
- [State Colocation will make your React app faster — Kent C. Dodds](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) — Keep state near its usage; lift only when a second consumer appears. (The skill uses the maintainability half of this argument; the performance half belongs to `react-best-practices`.)
- [Locality of Behavior / Co-location — Matias Kinnunen](https://mtsknn.fi/blog/locality-of-behavior-and-co-location/) — "Things that change together should be located as close as reasonable" as a general principle.

### Business logic, hooks and services

- [Separation of concerns with React hooks — Felix Gerschau](https://felixgerschau.com/react-hooks-separation-of-concerns/) — Hooks as the modern separation mechanism between UI and logic.
- [Custom react hooks vs services — DEV](https://dev.to/chiangs/custom-react-hooks-vs-services-mcm) — The decision table in `business-logic.md`: a service is callable anywhere and knows nothing about React; a hook only runs inside a component but can hold state and read context.
- [Presentational and Container Components — Dan Abramov](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) — The original pattern, carrying the author's own note that it is "left intact for historical reasons but don't take it too seriously" now that hooks remove the arbitrary split.
- [Container/Presentational Pattern — patterns.dev](https://www.patterns.dev/react/presentational-container-pattern/) — How custom hooks replaced the container component.
- [RSC and the Echo of 'Presentational and Container Components' — DEV](https://dev.to/fibonacid/rsc-and-the-echo-of-presentational-and-container-components-33i) — How React Server Components revive the container role at the framework level.

### Server state

- [Practical React Query — TkDodo](https://tkdodo.eu/blog/practical-react-query) — Keeping server and client state separate; wrapping queries in custom hooks as the app's data-access surface.
- [React Query as a State Manager — TkDodo](https://tkdodo.eu/blog/react-query-as-a-state-manager) — "The frontend doesn't own the data" — what you hold is a snapshot. The basis for the rule against copying fetched data into `useState`.

### Component splitting and API design

- [When to Split a React Component (And When You're Over-Engineering) — DEV](https://dev.to/137foundry/when-to-split-a-react-component-and-when-youre-over-engineering-2a6e) — The split signals used in `component-anatomy.md`: several distinct jobs, a description needing multiple "and"s, prop traffic jams — and the counter-rule that a long cohesive component is fine.
- [Compound Components with React Hooks — Kent C. Dodds](https://kentcdodds.com/blog/compound-components-with-react-hooks) — Parent-holds-state, children-read-via-context; the alternative to prop-heavy APIs.
- [Building Type-Safe Compound Components — TkDodo](https://tkdodo.eu/blog/building-type-safe-compound-components) — Typing the pattern, and why it suits design systems better than one wide prop interface.
- [How to Use the Compound Components Pattern in React: Prop Soup to Flexible UIs — freeCodeCamp](https://www.freecodecamp.org/news/compound-components-pattern-in-react/) — "Each new boolean doubles the number of possible UI states", plus the caveat that free composition can break layout and accessibility.
- [Naming Conventions in React — Sufle](https://www.sufle.io/blog/naming-conventions-in-react) — Component, file and constant naming conventions.

### Module boundaries and enforcement

- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) — Declaring architectural elements and the dependency rules between them, with instant feedback on violations.
- [Taking Frontend Architecture Serious With Dependency-cruiser — Xebia](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) — Dependency rules as an "architecture fitness function"; project-wide graphs and cycle detection.
- [Enforce Module Boundaries — Nx](https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries) — Tag-based boundary enforcement, the most mature version of the idea.
- [The Beyoncé Rule — Frontend at Scale](https://frontendatscale.com/issues/36/) — "If you liked it, you should have put a test on it": why architectural conventions decay unless a tool checks them.

### Barrel files

- [Are TypeScript Barrel Files an Anti-pattern? — Steven Lemon](https://steven-lemon182.medium.com/are-typescript-barrel-files-an-anti-pattern-72a713004250) — The balanced case: barrels give a folder a public interface behind which internals can be refactored, at a real cost.
- [Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking, Next.js Dev Memory, and tsc — ReactUse](https://reactuse.com/blog/barrel-files-tree-shaking/) — The costs quantified, and the rules adopted here: one level only, never chain barrels, use `export type`.

### Next.js data layer

- [Route Handler vs Server Action in Production for Next.js — Wisp](https://www.wisp.blog/blog/route-handler-vs-server-action-in-production-for-nextjs) — The "who triggers it?" heuristic: a person from your UI → Server Action; a machine → Route Handler.
- [Should I use Server Actions instead of API Route Handlers for fetching data? — vercel/next.js discussion #72919](https://github.com/vercel/next.js/discussions/72919) — Official position that Server Actions are for mutations and fetching belongs in Server Components.

### Repository sources for `references/this-repo.md`

- `client/AGENTS.md` — component-is-a-folder rule, the two folder-casing zones, no-Tailwind rule, type-only `@devdigest/shared`, dual path aliases.
- `client/docs/architecture.md` — the single data path (`api.ts` → hooks → components), the `ApiError` taxonomy and error UX rules, provider stack, theming, routing and i18n.
- `client/INSIGHTS.md` — recorded traps, including the portaled-popover clipping and the `MonoLink` tab-stop finding.
- Root `AGENTS.md` — naming conventions for routes, test hooks, i18n and contracts; the vendored-copy rules.

### A note on the `react-best-practices` overlap

That skill contains a "Tailwind CSS" section and a `useApiQuery`/`useApiMutation` data-fetching
convention. Neither matches this repository: `client/AGENTS.md` forbids Tailwind utilities in
app code, and no such hooks exist. `references/this-repo.md` states the correct conventions and
flags the discrepancy. Fixing the other skill is tracked separately and out of scope here.
