# Component anatomy

Where a component lives, when to split it, and how to design its props.

## Contents

- [File or folder?](#file-or-folder)
- [When to split](#when-to-split)
- [When not to split](#when-not-to-split)
- [Split into a hook, not a sub-component](#split-into-a-hook-not-a-sub-component)
- [Props and component API](#props-and-component-api)
- [Container / Presentational, in 2026](#container--presentational-in-2026)

## File or folder?

Start as a single file. Promote to a folder the moment the component owns anything besides
its markup — styles, constants, helpers, types, a test, sub-components.

```
FindingCard.tsx                     # just JSX

FindingCard/                        # owns more than JSX
├── FindingCard.tsx
├── styles.ts
├── constants.ts
├── helpers.ts
├── types.ts
├── FindingCard.test.tsx
└── index.ts
```

The folder is what makes colocation possible. A component's helper sitting in a distant
`utils/` file is invisible to anyone reading the component, and it survives long after the
component is deleted.

Only add the files the component actually needs. A folder with an empty `constants.ts` is
ceremony, not structure.

## When to split

The useful signals are about *responsibility*, not length:

- **It does several distinct things.** Fetching, rendering a form, and handling submission are
  three jobs.
- **You cannot describe it in one short phrase.** If the description needs several "and"s, it
  is doing too much.
- **A piece is genuinely reused**, or plausibly will be, in more than one place.
- **The tests are getting awkward.** Needing elaborate setup to reach one branch usually means
  that branch belongs to its own unit.
- **Props are being threaded through layers** just so a deep child can read one value.

## When not to split

A long but cohesive component that does one thing is fine. Splitting it produces a set of
fragments that are only ever used together, and now a reader has to reassemble them mentally
across six files to understand one screen.

Two more cases where splitting makes things worse:

- **One-use wrapper components** that add a `div` and forward every prop. They add a name and
  an indirection without adding meaning.
- **Splitting by line count.** "Max N lines" is a smell detector, not a rule. Investigate a
  long file; don't reflexively cut it.

The goal is clarity, not a target file size.

## Split into a hook, not a sub-component

When a component is hard to read because of its *logic* — several pieces of state that move
together, an effect coordinating with an external system, a non-trivial transformation —
extracting markup does not help. The complexity is not in the JSX.

Extract the logic into a custom hook instead. The component keeps its shape and reads as a
statement of intent:

```tsx
// The component now says what it does, not how.
const { rows, sort, setSort } = useSortedFindings(findings)
```

Custom hooks exist precisely to hide the details of dealing with state or an external system,
so the component expresses intent rather than implementation.

## Props and component API

**Composition over configuration.** Every boolean prop doubles the number of states the
component can be in, and most of those combinations are never tested and some are nonsense.
A component that grew `isCompact`, `hideHeader`, `variant`, `withBorder` and `dense` is asking
to be recomposed instead of configured.

Practical guidance:

- Prefer `children` and slot props over flags that switch markup on and off.
- When a group of components shares implicit state, use the **compound component** pattern —
  a parent holds the state and exposes children that read it through context, so consumers
  compose (`<Tabs><Tabs.List/><Tabs.Panel/></Tabs>`) instead of passing a config object.
  This is how design systems avoid prop-soup APIs.
- Make controlled mode opt-in: accept an optional value prop, fall back to internal state when
  it is absent. Consumers that need control get it; the rest get a component that just works.
- Compound components give consumers freedom to reorder or omit parts, which can break layout
  or accessibility. Decide deliberately which compositions are supported.

**A caution on prop count.** Many props is a signal, not a violation. Investigate whether the
component is doing several jobs; if it genuinely renders one thing with many knobs (a chart, a
date picker), a wide API is honest.

## Container / Presentational, in 2026

The original pattern separated components that *fetch and manage* from components that
*render*. Its author has since noted the article is left up for historical reasons and should
not be taken too seriously: hooks achieve the same separation without forcing an arbitrary
split into two component files.

What survives, and is worth keeping:

- Keep data access and orchestration out of the component that renders markup.
- Presentational components that receive everything through props are trivially testable and
  reusable.

What replaced the container:

- **A custom hook** in a client-rendered app.
- **A Server Component** in Next.js App Router — it fetches on the server and passes data to a
  client component as props, which is the pattern's original shape expressed by the framework.
