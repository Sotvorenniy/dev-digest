import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { CsvExporter } from '../../ports/csv-exporter.js';
import { ValidationError } from '../../platform/errors.js';
import { EXPORT_COLUMNS } from './constants.js';
import { statusOf } from './domain.js';
import type { FindingExportRepositoryPort } from './ports.js';

const ExportRequest = z.object({
  prId: z.string().uuid(),
  status: z.enum(['accepted', 'dismissed', 'open', 'all']).default('all'),
});
type ExportRequest = z.input<typeof ExportRequest>;

export interface FindingExportDeps {
  db: Db;
  repo: FindingExportRepositoryPort;
  csv: CsvExporter;
}

export class FindingExportService {
  constructor(private readonly deps: FindingExportDeps) {}

  async exportCsv(workspaceId: string, input: ExportRequest): Promise<string> {
    const parsed = ExportRequest.safeParse(input);
    if (!parsed.success) throw new ValidationError('Invalid export request', parsed.error.flatten());
    const { prId, status } = parsed.data;
    const { db, repo, csv } = this.deps;

    return db.transaction(async (tx) => {
      const findings = await repo.listFindings(tx, workspaceId, prId);
      const rows = findings
        .filter((f) => status === 'all' || statusOf(f) === status)
        .map((f) => ({
          severity: f.severity,
          category: f.category,
          file: f.file,
          line: f.startLine,
          title: f.title,
          status: statusOf(f),
        }));
      await repo.recordExport(tx, workspaceId, prId, rows.length);
      return csv.toCsv(EXPORT_COLUMNS, rows);
    });
  }
}
