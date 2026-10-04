import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { countedReviewIds } from '../pulls/domain.js';
import { buildSmartDiff } from './domain.js';
import type { SmartDiffRepositoryPort } from './ports.js';

export interface SmartDiffDeps {
  repo: SmartDiffRepositoryPort;
}

/** Groups a PR's files by role and marks the lines carrying CURRENT findings. */
export class SmartDiffService {
  constructor(private readonly deps: SmartDiffDeps) {}

  async get(workspaceId: string, prId: string): Promise<SmartDiff> {
    const { repo } = this.deps;
    if (!(await repo.pullExists(workspaceId, prId))) throw new NotFoundError('pull request not found');
    const [files, reviews] = await Promise.all([repo.listFiles(prId), repo.listReviewsNewestFirst(prId)]);
    // Current findings = newest review per agent (same rule as the PR list).
    const findings = await repo.listFindings([...countedReviewIds(reviews)]);
    return buildSmartDiff(files, findings);
  }
}
