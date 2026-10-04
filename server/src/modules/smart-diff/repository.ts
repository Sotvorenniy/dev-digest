import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SmartDiffFileInput } from './domain.js';
import type { SmartDiffFindingRow, SmartDiffRepositoryPort, SmartDiffReviewRow } from './ports.js';

/** pr_files / reviews / findings reads for the smart-diff module. Implements SmartDiffRepositoryPort. */
export class SmartDiffRepository implements SmartDiffRepositoryPort {
  constructor(private readonly db: Db) {}

  async pullExists(workspaceId: string, prId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return !!row;
  }

  async listFiles(prId: string): Promise<SmartDiffFileInput[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows;
  }

  async listReviewsNewestFirst(prId: string): Promise<SmartDiffReviewRow[]> {
    return this.db
      .select({ id: t.reviews.id, prId: t.reviews.prId, agentId: t.reviews.agentId })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      // `id` breaks ties so "newest wins" is a total order.
      .orderBy(desc(t.reviews.createdAt), desc(t.reviews.id));
  }

  async listFindings(reviewIds: string[]): Promise<SmartDiffFindingRow[]> {
    if (reviewIds.length === 0) return [];
    return this.db
      .select({ reviewId: t.findings.reviewId, file: t.findings.file, startLine: t.findings.startLine })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviewIds));
  }
}
