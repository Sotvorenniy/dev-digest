# Examples — BAD / GOOD

All examples use this repo's real shapes (`agents`, `pulls`).

## 1. Query in a route (CRITICAL — `routes-no-data-access`)

```ts
// BAD — modules/pulls/routes.ts today
import { and, desc, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';

app.get('/repos/:id/pulls', async (req) => {
  const rows = await container.db.select().from(t.pullRequests)
    .where(eq(t.pullRequests.repoId, req.params.id)).orderBy(desc(t.pullRequests.updatedAt));
  return rows.map(toPullDto);
});
```

```ts
// GOOD — routes.ts only parses, calls, shapes
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.listForRepo(workspaceId, req.params.id);
});

// ports.ts
export interface PullsRepositoryPort {
  listByRepo(workspaceId: string, repoId: string): Promise<PullRequest[]>;
}

// repository.ts — the only file that sees Drizzle
export class PullsRepository implements PullsRepositoryPort {
  constructor(private db: Db) {}
  async listByRepo(workspaceId: string, repoId: string) {
    const rows = await this.db.select().from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.repoId, repoId)))
      .orderBy(desc(t.pullRequests.updatedAt));
    return rows.map(toPullRequest);
  }
}
```

## 2. Service locator (HIGH — `application-no-infrastructure`)

```ts
// BAD — modules/agents/service.ts today
import type { Container } from '../../platform/container.js';
import { AgentsRepository } from './repository.js';

export class AgentsService {
  private repo: AgentsRepository;
  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }
}
```

```ts
// GOOD
import type { LLMProvider, Provider } from '@devdigest/shared';
import type { AgentsRepositoryPort } from './ports.js';

export interface AgentsServiceDeps {
  agents: AgentsRepositoryPort;
  llm: (id: Provider) => Promise<LLMProvider>;
}
export class AgentsService {
  constructor(private readonly deps: AgentsServiceDeps) {}
}

// platform/container.ts — composition root
get agentsService(): AgentsService {
  return (this._agentsService ??= new AgentsService({
    agents: this.agentsRepo,
    llm: (id) => this.llm(id),
  }));
}
```

## 3. Infrastructure type leaking through a port (CRITICAL)

```ts
// BAD — the port depends on the Drizzle schema
import type * as t from '../../db/schema.js';
export interface AgentsRepositoryPort {
  getById(ws: string, id: string): Promise<typeof t.agents.$inferSelect | undefined>;
}
```

```ts
// GOOD — the port speaks domain
import type { Agent } from './domain.js';
export interface AgentsRepositoryPort {
  getById(workspaceId: string, id: string): Promise<Agent | undefined>;
}
```

## 4. Zod in the core (`core-zod-type-only`)

```ts
// BAD — domain.ts
import { z } from 'zod';
export const Severity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);
export function worst(xs: unknown[]) { return xs.map((x) => Severity.parse(x)) /* … */; }
```

```ts
// GOOD — domain.ts reuses the contract type, parsing happened at the route
import type { z } from 'zod';
import type { Severity as SeveritySchema } from '@devdigest/shared';
export type Severity = z.infer<typeof SeveritySchema>;
const RANK: Record<Severity, number> = { SUGGESTION: 0, WARNING: 1, CRITICAL: 2 };
export const worst = (xs: Severity[]): Severity =>
  xs.reduce<Severity>((a, b) => (RANK[b] > RANK[a] ? b : a), 'SUGGESTION');
```

## 5. Adapter reaching into a module (`adapters-not-inward-of-modules`)

```ts
// BAD — adapters/astgrep/index.ts today
import { MAX_SIGNATURE_CHARS, SUPPORTED_EXT } from '../../modules/repo-intel/constants.js';
```

```ts
// GOOD — the constant belongs to the port, or is injected
// src/ports/code-structure.ts
export interface CodeStructureOptions { supportedExt: readonly string[]; maxSignatureChars: number; }
// adapters/astgrep receives CodeStructureOptions in its constructor;
// container.ts passes SUPPORTED_EXT / MAX_SIGNATURE_CHARS from repo-intel/constants.
```

## 6. Transaction boundary (service decides, infra executes)

```ts
// BAD — the service holds a Drizzle tx
await this.container.db.transaction(async (tx) => {
  await tx.update(t.agents).set(patch).where(eq(t.agents.id, id));
  await tx.insert(t.agentVersions).values(snapshot);
});

// GOOD
await this.deps.uow.run(async ({ agents, versions }) => {
  const agent = await agents.update(workspaceId, id, patch);
  if (isConfigChange(patch)) await versions.append(agent);
});
```

## 7. Thin module — allowed vs not

```ts
// OK — workspace/routes.ts with no DB: returns data from a port
app.get('/workspace', async (req) => getContext(app.container, req));

// NOT OK — a routes-only module that queries
const repos = await container.db.select().from(t.repos)…   // → add service.ts + port
```
