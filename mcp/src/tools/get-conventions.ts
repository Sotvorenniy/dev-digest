import { z } from 'zod';
import { idPath } from '../api/client.js';
import { ConventionsResponse } from '../api/schemas.js';
import { MAX_RESULT_CHARS, PAGE_SIZE_CONVENTIONS, TEXT_CLIP, UNTRUSTED_NOTE } from '../constants.js';
import { jsonResult, toErrorResult } from '../errors.js';
import { clip, compact, paginate } from '../format.js';
import { resolveRepo } from '../resolve.js';
import { TOOL_DESCRIPTIONS } from './descriptions.js';
import { cursorParam, repoParam } from './params.js';
import type { Deps, Extra } from './types.js';

const inputSchema = {
  repo: repoParam,
  status: z
    .enum(['accepted', 'pending', 'all'])
    .optional()
    .describe('Which rules to return: accepted (default), pending or all'),
  cursor: cursorParam,
};

export const getConventionsTool = {
  name: 'get_conventions' as const,
  config: {
    description: TOOL_DESCRIPTIONS.get_conventions,
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler:
    (deps: Deps) =>
    async (args: { repo: string; status?: 'accepted' | 'pending' | 'all'; cursor?: string }, extra: Extra) => {
      try {
        const { repoId } = await resolveRepo(deps.api, args.repo, extra.signal);
        const res = await deps.api.get(
          idPath('/repos', repoId, '/conventions'),
          ConventionsResponse,
          extra.signal,
        );
        const status = args.status ?? 'accepted';
        const wanted = res.candidates.filter((c) =>
          status === 'all' ? c.status !== 'rejected' : c.status === status,
        );
        const rows = wanted.map((c) => {
          const lines =
            c.evidence_start_line != null
              ? `:${c.evidence_start_line}${c.evidence_end_line != null && c.evidence_end_line !== c.evidence_start_line ? `-${c.evidence_end_line}` : ''}`
              : '';
          return compact({
            category: c.category,
            rule: clip(c.rule, TEXT_CLIP),
            evidence: `${c.evidence_path}${lines}`,
            confidence: c.confidence != null ? Math.round(c.confidence * 100) / 100 : undefined,
          });
        });
        const page = paginate(rows, args.cursor, PAGE_SIZE_CONVENTIONS, MAX_RESULT_CHARS);
        const pending = res.candidates.filter((c) => c.status === 'pending').length;
        const hint =
          status === 'accepted' && wanted.length === 0 && pending > 0
            ? `0 accepted; ${pending} pending; call with status=pending`
            : wanted.length === 0 && res.scan.status === 'never_run'
              ? 'no scan has run for this repo; start a convention scan in the DevDigest web UI'
              : undefined;
        return jsonResult(
          compact({
            scan: compact({
              status: res.scan.status,
              error: res.scan.error ? clip(res.scan.error, TEXT_CLIP) : undefined,
            }),
            conventions: page.items,
            hint,
            truncated: page.truncated ? true : undefined,
            next_cursor: page.next_cursor,
            untrusted: wanted.length > 0 || res.scan.error ? UNTRUSTED_NOTE : undefined,
          }),
        );
      } catch (err) {
        return toErrorResult(err);
      }
    },
};
