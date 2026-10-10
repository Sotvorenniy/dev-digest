import { z } from 'zod';
import { idPath } from '../api/client.js';
import { ReviewLite, RunLite, Severity } from '../api/schemas.js';
import { MAX_RESULT_CHARS, PAGE_SIZE_FINDINGS, SUMMARY_CLIP, TEXT_CLIP, UNTRUSTED_NOTE } from '../constants.js';
import { errorResult, jsonResult, toErrorResult } from '../errors.js';
import { clip, compact, latestReviewPerAgent, paginate } from '../format.js';
import { resolvePr } from '../resolve.js';
import { TOOL_DESCRIPTIONS } from './descriptions.js';
import { collectFindings, reviewHeader } from './findings-shared.js';
import { cursorParam, prParam, repoParam } from './params.js';
import type { Deps, Extra } from './types.js';

const inputSchema = {
  repo: repoParam,
  pr: prParam,
  run_id: z
    .string()
    .max(64)
    .optional()
    .describe('run_id from run_agent_on_pr; omit for the latest review per agent'),
  min_severity: Severity.optional().describe('Lowest severity to include: CRITICAL, WARNING or SUGGESTION'),
  cursor: cursorParam,
};

const ReviewList = z.array(ReviewLite);
const RunList = z.array(RunLite);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getFindingsTool = {
  name: 'get_findings' as const,
  config: {
    description: TOOL_DESCRIPTIONS.get_findings,
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler:
    (deps: Deps) =>
    async (
      args: { repo: string; pr: number; run_id?: string; min_severity?: Severity; cursor?: string },
      extra: Extra,
    ) => {
      try {
        const { prId } = await resolvePr(deps.api, args.repo, args.pr, extra.signal);
        const reviews = await deps.api.get(idPath('/pulls', prId, '/reviews'), ReviewList, extra.signal);

        // Summary-kind reviews are not agent reviews; the run_id path keeps whatever the run produced.
        let selected = latestReviewPerAgent(reviews.filter((r) => r.kind !== 'summary'));
        if (args.run_id) {
          if (!UUID.test(args.run_id)) {
            return errorResult('unknown run_id; omit it to see the latest reviews');
          }
          selected = reviews.filter((r) => r.run_id === args.run_id);
          if (selected.length === 0) {
            const runs = await deps.api.get(idPath('/pulls', prId, '/runs'), RunList, extra.signal);
            const run = runs.find((r) => r.run_id === args.run_id);
            if (!run) return errorResult('unknown run_id; omit it to see the latest reviews');
            if (run.status === 'running') {
              return jsonResult({ status: 'running', next: 'retry get_findings in ~30s' });
            }
            if (run.status === 'failed' || run.status === 'cancelled') {
              const error = run.error ? clip(run.error, TEXT_CLIP) : undefined;
              return jsonResult(
                compact({ status: run.status, error, untrusted: error ? UNTRUSTED_NOTE : undefined }),
              );
            }
            return jsonResult({
              status: run.status ?? 'unknown',
              next: 'run has no stored review; omit run_id to see the latest reviews',
            });
          }
        }

        if (selected.length === 0) {
          return jsonResult({ reviews: [], hint: 'no reviews on this PR yet; call run_agent_on_pr' });
        }

        const { findings, dismissed } = collectFindings(selected, args.min_severity);
        const page = paginate(findings, args.cursor, PAGE_SIZE_FINDINGS, MAX_RESULT_CHARS);
        return jsonResult(
          compact({
            reviews: selected.map((r) => reviewHeader(r, SUMMARY_CLIP)),
            findings: page.items,
            dismissed: dismissed > 0 ? dismissed : undefined,
            truncated: page.truncated ? true : undefined,
            next_cursor: page.next_cursor,
            untrusted: UNTRUSTED_NOTE,
          }),
        );
      } catch (err) {
        return toErrorResult(err);
      }
    },
};
