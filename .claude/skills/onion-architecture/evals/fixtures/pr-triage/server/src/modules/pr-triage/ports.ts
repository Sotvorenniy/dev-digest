import type * as t from '../../db/schema.js';

export type PullRow = typeof t.pullRequests.$inferSelect;

export interface TriageRepositoryPort {
  listOpenPulls(workspaceId: string, repoId: string, limit: number): Promise<PullRow[]>;
  repoExists(workspaceId: string, repoId: string): Promise<boolean>;
}
