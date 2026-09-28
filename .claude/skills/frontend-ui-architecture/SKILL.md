---
name: frontend-ui-architecture
version: 1.1.0
description: "UI architecture and code placement for React + Next.js codebases — where code belongs, not how fast it renders. Use this skill whenever the question is structural: where to put a new component, file, constant, helper, utility, type or hook; how to split a component that has grown too big; where business logic should live versus UI; how to draw feature and module boundaries; how to organize an App Router project, route folders and the server/client boundary; or when reviewing a diff that adds new files or moves code around. Use it even when the user just says 'where should this go?', 'is this the right place for this?', 'how should I structure this feature?' or 'this component is getting messy'. Does NOT cover rendering performance, re-renders, memoization, hooks misuse or accessibility (use react-best-practices), nor Next.js file-convention APIs such as metadata, fonts or image optimization (use next-best-practices)."
---

# Frontend UI Architecture

Where code belongs in a React + Next.js codebase, and why. This skill answers placement
and boundary questions; it deliberately says nothing about rendering performance or hook
correctness, which `react-best-practices` already covers.

Read the reference file for the question at hand rather than all of them:

| Question | Read |
|---|---|
| Where does this component live? How do I split it? What props should it take? | [references/component-anatomy.md](references/component-anatomy.md) |
| Where do constants / helpers / utilities / types go? Should this be a barrel? | [references/code-placement.md](references/code-placement.md) |
| Where does business logic live? Hook or service? What about server data? | [references/business-logic.md](references/business-logic.md) |
| How do I organize routes, `_components`, route groups, the RSC boundary? | [references/nextjs-app-router.md](references/nextjs-app-router.md) |
| **What are this repo's actual conventions?** | [references/this-repo.md](references/this-repo.md) |

Code examples in BAD/GOOD form: [examples.md](examples.md).

> **Working in `client/` of this repo? Read
> [references/this-repo.md](references/this-repo.md) first.** It records conventions that
> deliberately diverge from the generic rules below — component folders carry a `styles.ts`,
> nested `_components/` share the parent's styles, there is no `utils/` directory, and Tailwind
> is not used. Where the two disagree, that file wins.

## Severity levels

Tagged on the sections below, matching the convention the sibling skills use. The reference
files are not tagged — they are detail, read on demand:

- **CRITICAL** — gets the architecture wrong in a way that compounds; expensive to undo later
- **HIGH** — causes friction and confusion as the codebase grows
- **MEDIUM** — hurts consistency and readability

---

## Start here: the placement decision

When you have a piece of code and don't know where it goes, answer two questions in order.

**1. How many places use it, right now?**

| Used by | Goes |
|---|---|
| One component | Inside that component's folder |
| Several components in one route or feature | At the feature/route level, beside `page.tsx` or in the feature root |
| Several unrelated features | In the shared layer |

**2. Does it know about your domain?**

Domain-aware code (understands findings, repos, pull requests) belongs to a feature even
when several features use it. Domain-neutral code (date formatting, string casing) belongs
in the shared layer. A function that formats a *severity label* is not a utility — it is
feature code that happens to be short.

Answer both before reaching for `shared/` or `utils/`. The common failure is answering
neither and defaulting to a global folder.

## Colocation first (CRITICAL)

> "Place code as close to where it's relevant as possible." — Kent C. Dodds

Put new code next to its only consumer. Move it up **only when a second, unrelated consumer
actually appears** — not when you imagine one might.

This is worth being strict about because the two directions are not symmetric. Moving a
colocated file up to shared when a second caller appears is a five-minute mechanical change.
Pulling a premature abstraction back down is not: by then three callers have bent it to their
own needs, and the shared version has grown flags nobody can safely remove.

The same rule governs state: keep state in the component that uses it, and lift it only when
a sibling genuinely needs to read it.

The test for whether colocation is working: **can you delete a feature by deleting its folder?**
If deleting `features/billing/` leaves dangling imports across the app, the boundary leaked.

## Feature boundaries (CRITICAL)

Group by what code *does* (auth, billing, reviews), not by what it *is* (components, hooks,
utils). Type-based top-level folders scale badly — `components/` with 200 entries tells you
nothing about the app, and every change touches four distant folders.

- A feature owns its own components, hooks, api calls, types and utils.
- **Features do not import from each other.** When two features need to interact, compose them
  one level up, at the app or route layer. A cross-feature import is the moment the boundary
  stops existing.
- A feature exposes a deliberate surface (its `index.ts`) and keeps the rest internal.

**The boundary unit is not always a `features/` folder.** In an App Router project it is
usually the route segment: `app/agents/**` and `app/repos/**` are the features, and the same
no-cross-import rule applies between them. Read the rule as "one bounded area of the product",
not as a mandated directory name — this repo has no `features/` directory and still has
features.

Feature-Sliced Design formalizes this further with layers → slices → segments, and is worth
reading if the app is large enough to need named architectural tiers. Its segment naming is
useful even without adopting the whole method: `ui` / `api` / `model` / `lib` / `config` say
what code is *for*, whereas `components` / `hooks` / `types` only say what shape it has.

## Unidirectional dependencies (HIGH)

Dependencies point one way:

```
shared  →  features  →  app
```

Shared code is importable by anything. Features import shared. The app layer composes
features. Nothing imports upward, and nothing imports sideways across features.

This is what makes changes local. Without it every module is potentially reachable from every
other, and "what breaks if I change this?" has no answer short of running everything.

Conventions decay unless something checks them. Encode the rule in the linter —
`eslint-plugin-boundaries`, `eslint-plugin-import`'s `no-restricted-imports`, or
`dependency-cruiser` for a project-wide graph with cycle detection. bulletproof-react ships a
working ESLint config for exactly this. An architecture nobody can violate by accident is
worth more than one documented in a README.

## Component anatomy (HIGH)

A component graduates from a file to a folder as soon as it owns more than JSX — styles,
constants, helpers, sub-components, a test.

Split when the component does several distinct things, when you cannot describe it without
"and", or when a piece is genuinely reused. **Do not split just because a file is long**: a long
cohesive component that does one thing is fine, and shattering it into six files that are only
ever used together makes the code harder to follow, not easier.

When a component is complex because of its *logic* rather than its *markup*, the right split is
usually a hook, not a sub-component.

Details, plus props/API design: [references/component-anatomy.md](references/component-anatomy.md).

## Where business logic lives (CRITICAL)

Three layers, and mixing them is the most common architectural mistake in React code:

| Layer | What it is | Where it goes |
|---|---|---|
| **Domain logic** | calculations, validation, transformations, rules | plain functions — no React import |
| **Application logic** | state, orchestration, effects, wiring domain to UI | custom hooks |
| **UI** | markup and event handlers | the component |

The payoff is testability. Domain logic written as plain functions is tested without
rendering anything; once the same rule lives inside a component it needs a DOM, a provider
tree and a user-event simulation to exercise.

Two rules that follow from this and are worth stating outright:

- **Server data is not component state.** Data from an API is a snapshot your frontend does
  not own. It belongs to a cache manager (TanStack Query), not to `useState` + `useEffect`.
  Copying fetched data into local state creates two sources of truth that immediately drift.
- **Derive instead of storing.** If a value can be computed from props or state, compute it
  during render. If you are not synchronizing with an external system, you probably do not
  need an Effect at all.

The table above is the whole rule. Open
[references/business-logic.md](references/business-logic.md) only for the parts not summarized
here: the service-vs-hook decision table, and the index of where each specific kind of logic
goes.

## Next.js App Router (HIGH)

Next.js is deliberately unopinionated about project organization and documents three valid
strategies (code outside `app/`, code in top-level folders inside `app/`, or split by
feature/route). Pick one and hold to it — the cost of a structure is inconsistency, not the
particular choice.

The two rules that matter most:

- **Colocation in `app/` is safe.** A route is not public until the segment has a `page` or
  `route` file, so components, helpers and tests can sit beside the page they belong to.
  `_folder` (private folder) makes the separation explicit and opts the folder out of routing.
- **`'use client'` is a boundary in the module graph, not a file annotation.** Everything a
  client file imports ends up in the client bundle. Keep Server Components high and push
  client components to the leaves. Do not mark a layout `'use client'` because one button
  needs `onClick` — extract the button.

Details, plus route groups, DAL and Server Actions vs Route Handlers:
[references/nextjs-app-router.md](references/nextjs-app-router.md).

## Anti-patterns

- **`utils/` as a junk drawer** — a folder whose name describes nothing accumulates everything.
  Name modules for what they do (`github-urls.ts`, `model-label.ts`), not for their shape.
- **A flat global `components/`** — fine at ten components, unnavigable at a hundred. Only
  genuinely app-wide, domain-free components belong there.
- **Barrels re-exporting barrels** — each layer costs tree-shaking, dev-server speed and
  invites import cycles. One barrel per folder, never chained.
- **Premature `shared/`** — code moved to shared "because it might be reused" acquires
  parameters for use cases that never arrive.
- **Cross-feature imports** — `features/reviews` importing `features/agents` quietly merges
  two features into one.
- **`'use client'` at the top of the tree** — one interactive child should not drag a whole
  page into the client bundle.
- **Business rules inside JSX** — a conditional expressing a domain rule buried in markup
  cannot be tested or reused.

## Sources

Every rule here traces to a cited source. See [README.md](README.md) for the full list,
grouped by topic.
