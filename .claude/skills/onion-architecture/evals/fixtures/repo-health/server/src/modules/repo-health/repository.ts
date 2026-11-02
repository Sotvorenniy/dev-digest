import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { HealthRepo, RepoHealthRepositoryPort } from './ports.js';

export class RepoHealthRepository implements RepoHealthRepositoryPort {
  constructor(private readonly db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<HealthRepo | null> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name, lastPolledAt: t.repos.lastPolledAt })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }
}
