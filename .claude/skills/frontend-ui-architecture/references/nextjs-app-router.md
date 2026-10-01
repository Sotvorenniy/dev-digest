# Next.js App Router architecture

Organization and boundaries only. For file-convention APIs — metadata, fonts, images, caching
directives — use the `next-best-practices` skill.

## Contents

- [Next.js is unopinionated on purpose](#nextjs-is-unopinionated-on-purpose)
- [Colocation in `app/`](#colocation-in-app)
- [Private folders `_folder`](#private-folders-_folder)
- [Route groups `(folder)`](#route-groups-folder)
- [Nest folders only for URLs](#nest-folders-only-for-urls)
- [The server/client boundary](#the-serverclient-boundary)
- [Passing Server Components into Client Components](#passing-server-components-into-client-components)
- [The data access layer](#the-data-access-layer)
- [Server Actions vs Route Handlers](#server-actions-vs-route-handlers)

## Next.js is unopinionated on purpose

The official docs state plainly that Next.js is unopinionated about how you organize and
colocate project files, and list three strategies:

1. **Project files outside `app/`** — `app/` is purely routing, everything else sits in
   top-level folders at the project root.
2. **Project files in top-level folders inside `app/`** — shared code lives at the root of
   `app/`.
3. **Split by feature or route** — globally shared code at the root, specific code pushed into
   the route segments that use it.

The docs' own summary is the right one: *choose a strategy that works for your team and be
consistent.* The cost comes from mixing strategies, not from picking the "wrong" one.

Strategy 3 is usually the best fit for an app that keeps growing, because it is the only one
where a route's code shrinks and grows with the route.

## Colocation in `app/`

Folders in `app/` define route structure, but **a route is not publicly accessible until the
segment contains a `page` or `route` file**, and even then only what `page`/`route` returns is
served. Project files can therefore sit inside route segments without becoming URLs.

This is what makes route-level colocation safe: a component used by exactly one page belongs
beside that page, not in a global `components/` folder three directories away.

## Private folders `_folder`

Prefixing a folder with an underscore opts it and everything inside it out of routing.

Since colocation is already safe by default, private folders are not strictly required. They
earn their place by:

- separating UI from routing at a glance,
- organizing internal files consistently across a project,
- grouping them in the editor's file tree,
- avoiding collisions with future Next.js file conventions.

That last point is a real consideration: an unprefixed `components/` folder inside a route
competes with a namespace Next.js controls.

## Route groups `(folder)`

A folder in parentheses organizes without appearing in the URL. Use it to:

- group routes by site section, intent or owning team,
- give a subset of sibling routes a shared layout,
- scope a `loading.tsx` to one route instead of all siblings in a segment,
- create multiple root layouts for sections with genuinely different shells.

## Nest folders only for URLs

Folder nesting in `app/` is URL structure, not organization. Nest only when the URL genuinely
has that segment; for everything else use route groups. Deep folder trees created for tidiness
produce URLs nobody wanted.

## The server/client boundary

`'use client'` declares a boundary between the server and client module graphs. Once a file is
marked, **everything it imports and the components it renders directly become part of the
client bundle.** It is a property of the graph, not a label on one file.

The architectural rule: **keep Server Components at the top of the tree and push Client
Components toward the leaves.** The smaller the client leaf, the smaller the bundle and the
more of the tree stays server-rendered.

The common failure is placing the boundary too high — marking a layout or page `'use client'`
because one button needs `onClick`. That pulls the entire subtree, including large static UI
and every library it imports, back into the client. Extract the interactive part into its own
file, mark that file, and leave the rest on the server.

## Passing Server Components into Client Components

A Client Component cannot import a Server Component. It *can* render one that arrives as
`children` or as a prop from a Server Component parent.

This is the main composition pattern, and worth internalizing: when a container needs client
state but its content does not — a modal, a collapsible panel, a tab shell — build the
container as a client component and pass the server-rendered content through `children`.

```tsx
// Server Component
<ClientShell>
  <ServerRenderedContent />   {/* stays on the server */}
</ClientShell>
```

## The data access layer

Centralize data access in a dedicated module rather than querying from wherever it is
convenient. No raw database or ORM calls outside it; Server Components, Route Handlers and
Server Actions all call DAL functions.

Architecturally this gives one place that knows how data is fetched, and one place where
authorization checks and the decision about what is safe to pass into the render context live.
Scattered data access means those checks are scattered too, and the one that gets forgotten is
the one that leaks.

## Server Actions vs Route Handlers

The useful heuristic: **who triggers it?**

| | Server Action | Route Handler |
|---|---|---|
| Triggered by | a person, from your UI | a machine — mobile app, webhook, third party |
| For | mutations internal to this app | a real, public, HTTP-accessible API |
| Gives you | no REST boilerplate for UI-only operations | full control over the HTTP layer |

Fetching for display should happen in Server Components and flow down as props. Server Actions
are designed for mutations; Route Handlers are the fallback for reading when Server Components
are not an option.
