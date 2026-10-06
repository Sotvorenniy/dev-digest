/** SmartDiffService with a fake port: workspace scoping and the "current findings" rule. */
import { describe, it, expect } from 'vitest';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import type { SmartDiffRepositoryPort, SmartDiffFindingRow } from '../src/modules/smart-diff/ports.js';
import { NotFoundError } from '../src/platform/errors.js';

function fake(over: Partial<SmartDiffRepositoryPort> = {}, findings: SmartDiffFindingRow[] = []): SmartDiffRepositoryPort {
  return {
    pullExists: async () => true,
    listFiles: async () => [{ path: 'src/a.ts', additions: 1, deletions: 0 }],
    listReviewsNewestFirst: async () => [],
    listFindings: async (ids) => findings.filter((x) => ids.includes(x.reviewId)),
    ...over,
  };
}

describe('SmartDiffService.get', () => {
  it('throws NotFoundError when the PR is not in the workspace', async () => {
    const svc = new SmartDiffService({ repo: fake({ pullExists: async () => false }) });
    await expect(svc.get('ws', 'pr')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('counts only the newest review per agent', async () => {
    const svc = new SmartDiffService({
      repo: fake(
        {
          listReviewsNewestFirst: async () => [
            { id: 'r-new', prId: 'pr', agentId: 'sec' },
            { id: 'r-old', prId: 'pr', agentId: 'sec' },
          ],
        },
        [
          { reviewId: 'r-new', file: 'src/a.ts', startLine: 5 },
          { reviewId: 'r-old', file: 'src/a.ts', startLine: 9 },
        ],
      ),
    });
    const d = await svc.get('ws', 'pr');
    expect(d.groups[0]!.files[0]!.finding_lines).toEqual([5]);
  });

  it('keeps every review that has no agent (own bucket each)', async () => {
    const svc = new SmartDiffService({
      repo: fake(
        {
          listReviewsNewestFirst: async () => [
            { id: 'r-a', prId: 'pr', agentId: null },
            { id: 'r-b', prId: 'pr', agentId: null },
          ],
        },
        [
          { reviewId: 'r-a', file: 'src/a.ts', startLine: 2 },
          { reviewId: 'r-b', file: 'src/a.ts', startLine: 4 },
        ],
      ),
    });
    const d = await svc.get('ws', 'pr');
    expect(d.groups[0]!.files[0]!.finding_lines).toEqual([2, 4]);
  });
});
