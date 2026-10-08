import { z } from 'zod';
import { errorResult, toErrorResult } from '../errors.js';
import { validatePr, validateRepo } from '../resolve.js';
import { TOOL_DESCRIPTIONS } from './descriptions.js';
import { prParam, repoParam } from './params.js';

// Input shape is frozen: the real implementation will keep repo, pr, path.
const inputSchema = {
  repo: repoParam,
  pr: prParam,
  path: z.string().max(500).optional().describe('Optional file path inside the repo to narrow the analysis'),
};

export const getBlastRadiusTool = {
  name: 'get_blast_radius' as const,
  config: {
    description: TOOL_DESCRIPTIONS.get_blast_radius,
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler: () => async (args: { repo: string; pr: number; path?: string }) => {
    try {
      validateRepo(args.repo);
      validatePr(args.pr);
      return errorResult(
        'get_blast_radius is not implemented yet; use get_findings for the review of this PR',
      );
    } catch (err) {
      return toErrorResult(err);
    }
  },
};
