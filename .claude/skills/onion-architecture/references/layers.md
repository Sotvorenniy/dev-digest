# Layers — what goes where

## The rings, inside out

| Ring (Palermo) | In this repo | Contains | Knows about |
|---|---|---|---|
| Domain Model | `modules/<m>/domain.ts` | Entities, value objects, invariants as pure functions, domain errors | Nothing but TS and other core files |
| Domain Services (ports) | `modules/<m>/ports.ts`, `src/ports/*.ts`, `vendor/shared/adapters.ts` (read-only) | Interfaces: repositories, gateways to external systems, `UnitOfWork` | Domain Model |
| Application Services | `modules/<m>/service.ts`, use-case files (`run-executor.ts`, `pipeline/*`) | One use case per method: load via ports → apply domain rules → persist via ports | Core |
| Infrastructure / UI | `repository.ts`, `src/adapters/*`, `src/db/*`, `routes.ts` | Drizzle, postgres, Fastify, SDKs, ripgrep/ast-grep/git | Everything inward |
| Composition root | `src/platform/container.ts`, `modules/index.ts`, `server.ts`, `app.ts` | Construction and wiring | Everything |

`src/platform/*` other than `container.ts` (errors, jobs, sse, prompts, resilience, …) is
**shared kernel**: cross-cutting code with no DB or framework dependency, usable from any
ring. Keep it that way — if a platform file starts importing Drizzle or an adapter, it has
become infrastructure and belongs behind a port.

## Placement decision

Ask in order:

1. **Does it construct something concrete or read config/secrets?** → `container.ts`.
2. **Does it speak HTTP (request, reply, status, Zod request schema)?** → `routes.ts`.
3. **Does it speak SQL/Drizzle, an SDK, the filesystem or a subprocess?** → a repository or
   an adapter, behind a port.
4. **Does it coordinate several steps of one user-visible action?** → `service.ts`.
5. **Is it a rule about the business that would still be true with no database and no HTTP?**
   → `domain.ts`.
6. **Is it an interface the service needs someone else to fulfil?** → `ports.ts`
   (or `src/ports/` if two modules need it).

## Ports: where and how

- **Module-local** (`modules/<m>/ports.ts`) — the default. Example: `AgentsRepositoryPort`.
- **Shared** (`src/ports/<topic>.ts`) — only once a *second* module needs the same port.
  Promote on the second consumer, not in anticipation.
- **Existing adapter ports** in `@devdigest/shared` (`LLMProvider`, `GitHubClient`,
  `GitClient`, `CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider`) — reuse them by
  `import type`. Never edit `vendor/**`; if one needs a new method, wrap it in a port in
  `src/ports/` that extends or composes it.
- **Owned by the consumer.** A port is shaped by what the service needs, not by what
  Drizzle or the SDK offers. `findEnabledByWorkspace(id)` — not `select(where)`.
- **Speaks domain.** Arguments and return types are domain types or plain values — never
  `$inferSelect`, a Drizzle `tx`, `Octokit`, an OpenAI response type.

## Services: dependencies in, not looked up

```ts
export interface AgentsServiceDeps {
  agents: AgentsRepositoryPort;
  llm: (id: Provider) => Promise<LLMProvider>;
}
export class AgentsService {
  constructor(private readonly deps: AgentsServiceDeps) {}
}
```

The whole `Container` inside a service is a service locator: it hides what the service
really depends on and drags every adapter's type into the application ring. Pass the
narrowest thing that works — a port, or a factory function when construction is async
(`llm`, `github`).

## Mapping

- **Rows ↔ domain** happens in the repository (`toDomain(row)` / `toRow(entity)`).
- **Domain ↔ wire DTO** (snake_case contracts from `@devdigest/shared`) happens at the
  presentation edge. Today many modules keep a `toXDto` in `helpers.ts` called by the
  service — acceptable while the domain type *is* the DTO, but do not let `helpers.ts`
  import the repository or `db/rows` to do it.

## Cross-module access

Module A may use module B only through:
- B's `ports.ts`, `domain.ts` or `types.ts` (a facade contract, e.g. `repo-intel/types.ts`), or
- a Container getter that returns B's port (`container.repoIntel`, `container.agentsRepo`).

Never import B's `service.ts` or `repository.ts` directly — the rule
`no-cross-module-internals` enforces it.

### Facade laundering

`no-cross-module-internals` matches the **import path**. A facade that re-exports an
internal defeats it: `export { BService } from './service.js'` in `b/types.ts` lets A write
`import type { BService } from '../b/types.js'` and pass the gate while depending on B's
concrete service. Judge a cross-module import by the file that **declares** the symbol:

- A facade (`domain.ts`, `ports.ts`, `types.ts`) re-exports only from its module's other
  core files. Re-exporting `service.ts`, `repository*`, `helpers.ts`, `constants.ts` or
  `routes.ts` is a finding on the facade.
- Each importer in another module that reaches such a symbol is a finding too — for a
  service class, depend on a port that B owns (or a Container getter typed as that port);
  for a constant, move it into B's `domain.ts` if it is a business rule, or own a copy.
- Importing B's pure `domain.ts` functions and types is fine — that is what the facade is for.
