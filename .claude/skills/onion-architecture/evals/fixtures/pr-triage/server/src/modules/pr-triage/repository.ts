import { and, eq, notInArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow, TriageRepositoryPort } from './ports.js';

const CLOSED = ['closed', 'merged'];

export class TriageRepository implements TriageRepositoryPort {
  constructor(private readonly db: Db) {}

  async listOpenPulls(workspaceId: string, repoId: string, limit: number): Promise<PullRow[]> {
    return this.db
      .select()
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          notInArray(t.pullRequests.status, CLOSED),
        ),
      )
      .limit(limit);
  }

  async repoExists(workspaceId: string, repoId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row !== undefined;
  }
}
