# Tools — how each backend tool fits the onion

## Fastify 5 — presentation only

- `routes.ts` does three things: **parse** (Zod schema on the route), **call** one service
  method, **shape** the reply. Anything else is a smell.
- Get the service once per plugin, from the Container, at plugin registration:
  `const service = app.container.agentsService;` (or build it there from Container ports
  while the module is being migrated). Never `new AgentsRepository(app.container.db)` in a route.
- `getContext(app.container, req)` (workspace/user) stays in routes — it is request-scoped
  presentation concern; pass plain `workspaceId` / `userId` into the service.
- **Errors**: services throw `AppError` subclasses from `src/platform/errors.ts`; the single
  `setErrorHandler` in `src/app.ts` maps them to HTTP. A route may translate `undefined →
  NotFoundError`; a service never calls `reply`.
- **Encapsulation**: each module is a plugin, so decorators and hooks it adds stay inside its
  scope. Use `fastify-plugin` only for something that must be visible to siblings (and that
  is composition-root territory, in `app.ts`).
- SSE (`fastify-sse-v2`, `platform/sse.ts`) is presentation: the service publishes to a
  `RunBus`-like port; the route streams it.

See `fastify-best-practices` for Fastify API detail.

## Drizzle + postgres — infrastructure only

- `drizzle-orm`, `db/schema`, `db/rows` and the `Db` type are imported **only** by
  `repository.ts` / `repository/*.repo.ts`, `src/db/**` and `container.ts`.
- A repository class **implements the port**:
  `export class DrizzleAgentsRepository implements AgentsRepositoryPort`.
  Keep the existing class names when refactoring (`AgentsRepository`) — only add `implements`.
- **Return domain types**, not `$inferSelect`. Where the domain type is currently identical
  to the row, alias it in `domain.ts` (`export type Agent = { … }`) instead of re-exporting
  the Drizzle-inferred row, so the port does not depend on the schema.
- **Workspace scoping** is a repository invariant: every query filters by `workspaceId`.
  The service passes it in; it never builds the filter.
- **Transactions** (none exist yet — introduce this shape when the first one is needed):
  ```ts
  // ports.ts (core)
  export interface UnitOfWork {
    run<T>(work: (repos: { agents: AgentsRepositoryPort; versions: AgentVersionsPort }) => Promise<T>): Promise<T>;
  }
  // repository.ts (infra)
  export class DrizzleUnitOfWork implements UnitOfWork {
    constructor(private db: Db) {}
    run<T>(work) {
      return this.db.transaction((tx) =>
        work({ agents: new AgentsRepository(tx), versions: new AgentVersionsRepository(tx) }));
    }
  }
  ```
  The **service** decides the transaction boundary (`uow.run(...)`); the Drizzle `tx` never
  leaves the infrastructure ring. Repositories take `Db | Tx` in their constructor so the
  same class works inside and outside a transaction (the Sentry "atomic repositories"
  pattern).
- Migrations stay drizzle-kit-generated (`server/AGENTS.md`); the architecture never
  changes how schema files are written.

See `drizzle-orm-patterns` for query syntax, `postgresql-table-design` for schema.

## Zod — parse at the boundary

- **Parse once, at the edge**: route schemas via `fastify-type-provider-zod`; external
  payloads (GitHub, LLM structured output) inside the adapter that receives them. After that
  the type is trusted — inner rings do not re-validate.
- Wire contracts in `@devdigest/shared` are **transport** types (snake_case). The domain may
  reuse them by `import type` while they coincide, and must diverge into its own type the
  moment the wire shape and the business shape disagree.
- **Core rule**: `import type { z }` / `z.infer<typeof X>` is allowed in `domain.ts` and
  `ports.ts`; `z.object(...)`, `.parse()`, `.safeParse()` are not (`core-zod-type-only`).
- Application services may use zod runtime only for data that did not pass a boundary
  (rare — usually a sign the parse belongs in an adapter).

See `zod` for schema patterns.

## Adapters (octokit, simple-git, openai, @anthropic-ai/sdk, ripgrep, ast-grep, js-tiktoken, dependency-cruiser)

- Live in `src/adapters/<topic>/`, implement a port from `@devdigest/shared` or `src/ports/`.
- SDK types never appear in the port. Map SDK responses to port types inside the adapter.
- Adapters never import from `src/modules/**` (`adapters-not-inward-of-modules`). If an
  adapter needs a constant that today lives in a module (e.g. `repo-intel/constants.ts`),
  move the constant to the port file or pass it as a constructor argument.
- Secrets come from `SecretsProvider` in the Container, never read by the adapter itself.

## The Container — composition root

- `src/platform/container.ts` is the **only** file that runs `new <Concrete>()` for
  adapters, repositories and services.
- It exposes **ports** (return type is the interface: `get git(): GitClient`), plus ready
  services for routes.
- `ContainerOverrides` is the test seam: tests swap a port, never monkey-patch a module.
- Services and use-case files must not `import type { Container }`. That import is the most
  common baselined violation — see `this-repo.md`.

## dependency-cruiser — the gate

- Config: `server/.dependency-cruiser.cjs`. Baseline:
  `server/.dependency-cruiser-known-violations.json`.
- `tsPreCompilationDeps: true` makes `import type` visible, which is what lets
  `core-zod-type-only` tell `import type { z }` from `import { z }`.
- `--ignore-known` suppresses baselined violations; anything new fails with a non-zero exit.
- It cannot see property access (`container.db.select()`) — `scripts/check.sh` greps for it.
