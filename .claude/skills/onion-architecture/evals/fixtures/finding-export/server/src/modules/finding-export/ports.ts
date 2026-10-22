import type { Db } from '../../db/client.js';
import type { ExportableFinding } from './domain.js';

export interface FindingExportRepositoryPort {
  listFindings(tx: Db, workspaceId: string, prId: string): Promise<ExportableFinding[]>;
  recordExport(tx: Db, workspaceId: string, prId: string, rowCount: number): Promise<void>;
}
