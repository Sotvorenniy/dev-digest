import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ExportableFinding } from './domain.js';
import type { FindingExportRepositoryPort } from './ports.js';

export class FindingExportRepository implements FindingExportRepositoryPort {
  async listFindings(tx: Db, workspaceId: string, prId: string): Promise<ExportableFinding[]> {
    return tx
      .select({
        id: t.findings.id,
        severity: t.findings.severity,
        category: t.findings.category,
        file: t.findings.file,
        startLine: t.findings.startLine,
        title: t.findings.title,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.prId, prId)));
  }

  async recordExport(tx: Db, workspaceId: string, prId: string, rowCount: number): Promise<void> {
    await tx.insert(t.jobs).values({
      workspaceId,
      kind: 'finding_export',
      status: 'done',
      payload: { pr_id: prId, rows: rowCount },
    });
  }
}
