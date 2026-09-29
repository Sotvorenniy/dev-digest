---
name: onion-architecture
version: 1.0.0
description: "Onion Architecture for the dev-digest backend (server/, Fastify 5 + Drizzle + Zod + DI container). Enforces the dependency rule — every import points inward, from routes to services to ports/domain, with repositories and adapters implementing ports from the outside. Use this skill whenever you create or change a backend module under server/src/modules, add a service, repository, route, port, adapter or use case, write a Drizzle query, touch platform/container.ts, move backend code between files, or review a server diff. Use it even when the user just says 'add an endpoint', 'where should this query go?', 'this route is getting big', 'add a new module' or mentions onion / hexagonal / clean architecture / ports and adapters. Runs dependency-cruiser as the mechanical gate. Does NOT cover Fastify API details (use fastify-best-practices), Drizzle query syntax (drizzle-orm-patterns), schema design (postgresql-table-design) or the React client (frontend-ui-architecture)."
---

# Onion Architecture — server

The one rule: **source dependencies point inward.** An inner ring never names anything
declared in an outer ring. Frameworks, the database and SDKs sit in the outermost ring and
plug in through interfaces that the core owns.

```
        ┌──────────────────────────────────────────────────────┐
        │ Presentation   routes.ts  (Fastify + Zod parsing)    │
        │  ┌────────────────────────────────────────────────┐  │
        │  │ Application   service.ts, use-case files       │  │
        │  │  ┌──────────────────────────────────────────┐  │  │
        │  │  │ Core   domain.ts · ports.ts · src/ports/ │  │  │
        │  │  └──────────────────────────────────────────┘  │  │
        │  └────────────────────────────────────────────────┘  │
        │ Infrastructure  repository.ts · src/adapters · src/db │
        └──────────────────────────────────────────────────────┘
          Composition root: src/platform/container.ts (sees everything)
```

## Rule block (non-negotiable)

- **Route → service → domain, wired via the container.** `routes.ts` calls a service; the service works against ports; `platform/container.ts` is the only place concrete classes are built.
- **External integrations (GitHub, LLM, git, SDKs) live only in adapters at the edge**, behind ports.
- **Dependencies point inward.** Inner rings never import outer ones.
- **A route must never call an adapter, a repository or the db directly** (no `container.db`, `db/schema`, `drizzle-orm`, no `container.<adapter>` in `routes.ts`). **CRITICAL.**

Read the reference that fits the task, not all of them:

| Task | Read |
|---|---|
| What may each file import? Where does this code go? | [references/layers.md](references/layers.md) |
| Fastify routes, Drizzle repositories, transactions, Zod, adapters, the Container | [references/tools.md](references/tools.md) |
| How to test each ring | [references/testing.md](references/testing.md) |
| This repo's known violations and the refactor order | [references/this-repo.md](references/this-repo.md) |
| Sources and rationale | [references/sources.md](references/sources.md) |

BAD/GOOD code pairs: [examples.md](examples.md). New-module skeleton: [templates/module/](templates/module/).

## Decisions (fixed for this repo)

1. **Ports.** Cross-module ports go in `server/src/ports/`, module-local ports in
   `modules/<m>/ports.ts`. Existing adapter ports in `src/vendor/shared/adapters.ts`
   (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `SecretsProvider`, …) are
   **reused, never edited** — `vendor/**` is a vendored copy.
2. **Zod in the core.** `domain.ts` / `ports.ts` may `import type` from zod (`z.infer`).
   A runtime zod call there is a violation — parsing happens at the boundary (routes).
3. **Thin modules.** A module that is only `routes.ts` (`polling`, `workspace`) is allowed
   **as long as it does not touch the DB** — no `drizzle-orm`, no `db/schema`, no
   `container.db`. The moment it needs data it gets a `service.ts` + repository port.
4. **Existing violations are baselined** in
   `server/.dependency-cruiser-known-violations.json`. They are tolerated, never extended.
   New code must pass with zero new violations.

## The files of a module

| File | Ring | Owns | Must NOT import |
|---|---|---|---|
| `domain.ts` | Core | Entities, value objects, pure rules, domain errors (subclass `AppError`) | fastify, drizzle, postgres, SDKs, `src/adapters`, `src/db`, `container`, runtime zod |
| `ports.ts` | Core | Interfaces the service needs: `<Entity>Repository`, external systems | same as `domain.ts` |
| `service.ts` (+ use-case files) | Application | Orchestration of one use case; transaction boundaries via a port | drizzle, `src/db`, `src/adapters`, `container`, `repository.ts` |
| `repository.ts` / `repository/*.repo.ts` | Infrastructure | Drizzle queries; implements a port; maps rows ↔ domain | `routes.ts`, `service.ts` |
| `routes.ts` | Presentation | Zod schemas, call the service, map to the wire DTO | drizzle, `src/db`, repositories, adapters |
| `helpers.ts` / `constants.ts` | Same ring as their consumer | Pure functions / constants | whatever their consumer's ring forbids |
| `platform/container.ts` | Composition root | The only place `new ConcreteThing()` runs | — |

Add `domain.ts` and `ports.ts` **when the module needs them** — the same rule as the other
roles in `server/AGENTS.md`. A service with one trivial repository may declare its port at
the top of `ports.ts` with nothing in `domain.ts`.

## Workflow

### Create (new module or new feature in a module)
1. Read `server/INSIGHTS.md` and name the entries that apply.
2. Start from the core outward: `domain.ts` → `ports.ts` → `service.ts` → `repository.ts` →
   `routes.ts`. Copy from [templates/module/](templates/module/).
3. The service takes its ports through the constructor — **a narrow deps object, never the
   whole `Container`**.
4. Wire it in `platform/container.ts` (construct repo + service) and register routes in
   `modules/index.ts` (one import + one entry).
5. Run the gate (below). Zero new violations.

### Review (a diff or a file)
1. Run the gate. Every error is a finding with its `path → path`.
2. Then walk the checklist below over the diff — it catches what imports cannot
   (e.g. `container.db` used without importing drizzle, SDK types leaking through a port).
3. Report each finding as `path:line`, the rule it breaks, and the inward-pointing fix.

### Refactor (paying down a baselined violation)
1. Pick one from [references/this-repo.md](references/this-repo.md) — smallest blast first.
2. Extract the query into the module's repository, declare the port, inject it.
3. Run the gate, then **regenerate the baseline** so the fixed violation cannot come back:
   `./node_modules/.bin/depcruise src --config .dependency-cruiser.cjs --output-type baseline > .dependency-cruiser-known-violations.json`
4. Check the diff of the baseline file: it must only **shrink**. A growing baseline means
   you added a violation — fix it instead.

## The gate

From `server/` (pnpm is broken here — call the bin directly):

```bash
.claude/skills/onion-architecture/scripts/check.sh    # from repo root; wraps both checks
# or directly:
./node_modules/.bin/depcruise src --config .dependency-cruiser.cjs --ignore-known --output-type err
```

`check.sh` also greps for `container.db` in routes/services outside the baselined files,
which dependency-cruiser cannot see.

## Checklist (CRITICAL → MEDIUM)

- **CRITICAL** — Does anything in `domain.ts` / `ports.ts` / `service.ts` import Drizzle,
  `src/db`, an SDK, a concrete adapter, or the `Container`?
- **CRITICAL** — Does a `routes.ts` run a query (`container.db…`, `import * as t from db/schema`)?
- **CRITICAL** — Does a port's signature expose an infrastructure type
  (`typeof t.agents.$inferSelect`, `Octokit`, `ChatCompletion`, a Drizzle `tx`)?
- **HIGH** — Does a service `new` its own repository or adapter instead of receiving a port?
- **HIGH** — Does a service re-parse data with zod that routes already parsed?
- **HIGH** — Does module A import module B's `service.ts` / `repository.ts` instead of its
  `ports.ts` / `domain.ts` / `types.ts` or a Container getter?
- **HIGH** — Does a domain/service error know its HTTP status beyond the `AppError` taxonomy
  (e.g. calling `reply.status` from a service)?
- **MEDIUM** — Does the repository return rows while the service needs domain objects? Map
  in the repository (`toDomain`), not in the route.
- **MEDIUM** — Is a new file in a module named for a role it doesn't play?

## When not to add rings

Palermo is explicit that the pattern pays off for long-lived, behaviour-rich code, not for
trivial CRUD. Do not create empty `domain.ts` files or one-method ports for their own sake.
The *direction* of dependencies is never optional; the number of files is.
