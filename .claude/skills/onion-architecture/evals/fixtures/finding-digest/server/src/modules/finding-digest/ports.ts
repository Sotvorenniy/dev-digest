import type * as t from '../../db/schema.js';

export type FindingRecord = typeof t.findings.$inferSelect;

/** Read side of the digest; FindingDigestRepository implements it. */
export interface FindingDigestRepositoryPort {
  listFindingsForPull(workspaceId: string, prId: string): Promise<FindingRecord[]>;
  pullExists(workspaceId: string, prId: string): Promise<boolean>;
}
