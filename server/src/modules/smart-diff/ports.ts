import type { SmartDiffFileInput } from './domain.js';

export interface SmartDiffFindingRow {
  reviewId: string;
  file: string;
  startLine: number;
}

export interface SmartDiffReviewRow {
  id: string;
  prId: string;
  agentId: string | null;
}

/** Port SmartDiffService depends on — SmartDiffRepository implements it. */
export interface SmartDiffRepositoryPort {
  /** True when the PR exists in this workspace. */
  pullExists(workspaceId: string, prId: string): Promise<boolean>;
  listFiles(prId: string): Promise<SmartDiffFileInput[]>;
  /** `kind='review'` reviews of the PR, ordered `createdAt desc, id desc`. */
  listReviewsNewestFirst(prId: string): Promise<SmartDiffReviewRow[]>;
  listFindings(reviewIds: string[]): Promise<SmartDiffFindingRow[]>;
}
