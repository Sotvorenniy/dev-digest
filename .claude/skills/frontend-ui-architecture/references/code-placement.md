# Code placement: constants, helpers, utilities, types, barrels

## Contents

- [The two questions](#the-two-questions)
- [Constants](#constants)
- [Helpers vs utilities](#helpers-vs-utilities)
- [Types](#types)
- [Hooks](#hooks)
- [Barrel files (`index.ts`)](#barrel-files-indexts)
- [Naming folders and segments](#naming-folders-and-segments)

## The two questions

Every placement decision reduces to scope and domain awareness:

1. **How many places use it right now?** One consumer → colocate. Several within one feature →
   feature level. Several unrelated features → shared.
2. **Does it know about the domain?** Domain-aware code belongs to a feature even when widely
   used. Only domain-neutral code belongs in the shared layer.

Default to the narrowest scope that works, and widen on evidence. Narrowing later is the
expensive direction.

## Constants

**Colocate by default.** A `constants.ts` next to its consumer keeps the value and its usage in
one place, and it disappears when the component does.

Promote to a shared module only for values that are genuinely cross-cutting — a design token
scale, a route table, an API base path. "Used twice" is not cross-cutting.

Conventions:

- `UPPER_SNAKE_CASE` for true constants; enum members `UPPER_SNAKE_CASE`, enum names
  `PascalCase`.
- Annotate types (or use `as const`) so a wrong value fails at compile time.
- **Replace magic numbers with named constants.** A bare `120` in code is a value with no
  explanation; `CLOSE_DELAY_MS = 120` documents itself and can be changed in one place.
- Group large constant sets by topic (`constants/api.ts`, `constants/ui.ts`) rather than
  accumulating one enormous file.

## Helpers vs utilities

The distinction is about domain knowledge, and it decides the folder:

| | Helper | Utility |
|---|---|---|
| Knows about | one component, route or feature's domain | nothing — pure and generic |
| Example | `panelPosition(anchor)`, `severityLabel(f)` | `clamp(n, lo, hi)`, `formatBytes(n)` |
| Lives in | `helpers.ts` beside its consumer | a shared, topic-named module |
| Moves up when | a second component in the same feature needs it | never really — it started generic |

**A helper does not become a utility by being used twice.** It becomes a *feature-level*
helper. It only reaches the shared layer if it also loses its domain knowledge, which usually
means rewriting it.

The progression, applied on evidence rather than in advance:

```
component/helpers.ts  →  feature/helpers.ts  →  shared module (only if domain-neutral)
```

**Avoid a folder named `utils/`.** A name that describes nothing attracts everything, and
within a year it is the least navigable folder in the repo. Name modules for their subject —
`github-urls.ts`, `model-label.ts`, `currency.ts` — so the import line says what it brings in.

## Types

- **Contract types** (the shape of wire data) come from a single source of truth — a schema
  module or generated client. Do not restate them per component; two hand-written copies drift
  silently.
- **View models** — shapes that exist only for rendering — live next to the component, in
  `types.ts` inside its folder.
- **Feature-wide types** used by several components in one feature live at the feature root.
- Re-export types with `export type` so the re-export is erased at build time.

## Hooks

Hooks follow the same scope rule as everything else:

- Used by one component → a `hooks/` folder inside that component's folder, or inline in its
  file if small.
- Used across one feature → the feature's `hooks/`.
- App-wide data access → a shared hooks module.

Domain data hooks are an exception worth noting: they are usually centralized even when each
is used in one place, because they form the app's data-access surface and benefit from being
discoverable together.

## Barrel files (`index.ts`)

A barrel gives a folder a deliberate public interface: consumers import from the folder, and
internal files can be reorganized freely. That is a real architectural benefit.

It is not free. A barrel pulls in every module it re-exports, which costs bundle size where
tree-shaking cannot see through it, slows dev-server transforms and `tsc`, and makes import
cycles easy to create — one module importing the barrel that re-exports it. bulletproof-react
explicitly warns about the tree-shaking cost and recommends direct imports in some setups.

Workable rules:

- **One barrel per folder, at the folder root.** It defines that folder's public surface.
- **Never chain barrels.** A barrel that re-exports another barrel multiplies the cost and is
  the main source of cycles.
- **Export types with `export type`** so they cost nothing at runtime.
- **Import deep paths inside a folder.** Files within a folder import their siblings directly,
  not through their own barrel.
- If a barrel exists only to shorten an import, it is not earning its cost.

## Naming folders and segments

Feature-Sliced Design recommends naming a folder for what its contents are *for*, not what
shape they have — `ui`, `api`, `model`, `lib`, `config` rather than `components`, `hooks`,
`types`. The reasoning is that `hooks/` tells you a technical detail you could see from the
filename anyway, while `model/` tells you the code holds the feature's state and rules.

Adopt the naming or not, but apply the underlying test: **does this folder name tell a reader
anything they couldn't guess?** `utils/`, `helpers/`, `common/` and `misc/` fail it.
