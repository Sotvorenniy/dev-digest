import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { FindingDigestRepositoryPort, FindingRecord } from './ports.js';

export class FindingDigestRepository implements FindingDigestRepositoryPort {
  constructor(private readonly db: Db) {}

  async listFindingsForPull(workspaceId: string, prId: string): Promise<FindingRecord[]> {
    const rows = await this.db
      .select({ finding: t.findings })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.prId, prId)))
      .orderBy(desc(t.findings.confidence));
    return rows.map((r) => r.finding);
  }

  async pullExists(workspaceId: string, prId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row !== undefined;
  }
}
