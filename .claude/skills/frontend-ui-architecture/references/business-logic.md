# Where business logic lives

## Contents

- [Three layers](#three-layers)
- [Why the split pays off](#why-the-split-pays-off)
- [Service or hook?](#service-or-hook)
- [Server state is not component state](#server-state-is-not-component-state)
- [Derive instead of storing](#derive-instead-of-storing)
- [State placement](#state-placement)
- [Where each kind of logic goes](#where-each-kind-of-logic-goes)

## Three layers

| Layer | What it is | Where it goes | Imports React? |
|---|---|---|---|
| **Domain logic** | calculations, validation, data transformation, domain rules | plain exported functions | no |
| **Application logic** | state, orchestration, side effects, wiring domain to UI | custom hooks | yes |
| **UI** | markup, event handlers | the component | yes |

The distinction between the first two is the one teams most often miss. "Business logic" is
usually treated as one bucket, but *what the rule is* and *when it runs in the UI* are
different concerns with different testing costs.

## Why the split pays off

Testability, mainly.

Domain logic written as a plain function has an input and an output. You test it by calling it.
No render, no provider tree, no fake timers, no user-event simulation.

The same rule expressed inside a component becomes reachable only through the UI. Now testing
"orders above €1000 need approval" means rendering a form, filling three fields, clicking
submit, and asserting on a banner — and the test breaks when the button label changes.

Secondary benefits: domain functions are reusable outside React (a server route, a script, a
worker), and they read as a specification of the domain rather than as UI plumbing.

## Service or hook?

Both are ways to get logic out of components, and they are not interchangeable:

| | Service (plain module) | Custom hook |
|---|---|---|
| Callable from | anywhere — components, other services, scripts, the server | only inside a component or another hook |
| Can use state / context | no | yes |
| Tested by | calling it | `renderHook` or rendering a component |

The rule that follows: **put framework-agnostic domain logic in services, and use hooks to
connect services to React.** A hook that contains no state, no context and no effect is a
function wearing a `use` prefix — make it a plain function and call it during render.

Concretely, a hook is the right home when the logic needs to observe or own state, subscribe to
something external, coordinate with the render lifecycle, or read context. Everything else is a
function.

## Server state is not component state

Data fetched from an API is not owned by the frontend. What you hold is a snapshot of how the
data looked when you asked for it — the server may have changed it a moment later. Treating it
like local state is the source of an entire family of bugs: stale screens, duplicated
refetching, spinners that never clear, and two components disagreeing about the same record.

So it belongs to an async cache manager (TanStack Query), not to `useState` + `useEffect`.
The cache handles the concerns that hand-rolled fetching always gets wrong eventually:
deduplication, staleness, background refresh, retries, and invalidation after a mutation.

Two consequences for architecture:

- **Do not copy fetched data into local state.** The moment you do, there are two sources of
  truth and they drift. Derive what you need from the query result instead.
- **Separate server state from client state deliberately.** UI state (a modal being open, a
  selected tab, a draft form value) is genuinely owned by the client and belongs in component
  state. Server state is not, and a global client store is the wrong home for it.

Wrap queries in named hooks (`useFindings(prId)`) rather than calling the query client inline.
The component then depends on your data-access surface, not on the caching library.

## Derive instead of storing

If a value can be computed from props or existing state, compute it during render. Storing it
means keeping two things in sync, and the sync is where the bug lives.

The corollary is the Effect rule: **if you are not synchronizing with an external system, you
probably do not need an Effect.** Effects exist to step outside React — a subscription, a
browser API, a non-React widget. Using one to transform data or to react to a prop change
introduces an extra render pass and a window where the UI shows a stale value.

When the logic *does* belong to an external system, wrap it in a named custom hook
(`useOnlineStatus()`) so the component expresses intent instead of mechanics.

## State placement

Keep state in the component that uses it. Lift it only when a sibling genuinely needs to read
it — and lift it exactly as far as the nearest common ancestor, no further.

State parked at the top of the tree "in case something needs it" makes every consumer indirect
and hard to trace, and turns an unrelated local interaction into a tree-wide concern.

Context is for dependency injection — theme, locale, the current user — not a general store.
When one subtree needs a value, passing it or composing with `children` is usually simpler
than adding a provider.

## Where each kind of logic goes

| Logic | Home |
|---|---|
| Validation rules, pricing, permissions, domain calculations | plain function module |
| Formatting a domain value for display | plain function, beside the feature |
| Fetching and caching server data | query hook over a single API client |
| Mutating server data and invalidating caches | mutation hook |
| Coordinating several pieces of local state | custom hook |
| Subscribing to a browser or third-party API | custom hook |
| Deciding what to render from props | the component, inline |
| Handling a click and calling a hook's action | the component |
