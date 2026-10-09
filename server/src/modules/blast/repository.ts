import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastPullRef, BlastRepositoryPort } from './ports.js';

/** pull_requests / pr_files reads for the blast module. Implements BlastRepositoryPort. */
export class BlastRepository implements BlastRepositoryPort {
  constructor(private readonly db: Db) {}

  async findPull(workspaceId: string, prId: string): Promise<BlastPullRef | null> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row ?? null;
  }

  async listFilePaths(prId: string): Promise<string[]> {
    const rows = await this.db.select({ path: t.prFiles.path }).from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }
}
