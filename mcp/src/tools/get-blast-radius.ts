import { z } from 'zod';
import { idPath } from '../api/client.js';
import { BlastLite } from '../api/schemas.js';
import {
  BLAST_ENVELOPE_CHARS,
  BLAST_MAX_FACTS,
  BLAST_MAX_NO_CALLER_NAMES,
  BLAST_PAGE_SIZE,
  MAX_RESULT_CHARS,
  TEXT_CLIP,
  UNTRUSTED_NOTE,
} from '../constants.js';
import { jsonResult, toErrorResult } from '../errors.js';
import { clip, compact, paginate } from '../format.js';
import { resolvePr } from '../resolve.js';
import { TOOL_DESCRIPTIONS } from './descriptions.js';
import { prParam, repoParam } from './params.js';
import type { Deps, Extra } from './types.js';

// Input shape is frozen: repo, pr, path.
const inputSchema = {
  repo: repoParam,
  pr: prParam,
  path: z.string().max(500).optional().describe('Optional file path inside the repo to narrow the analysis'),
};

const FILE_CLIP = 300;

interface Row {
  symbol: string;
  file?: string;
  callers: string[];
  callers_omitted?: number;
  endpoints?: string[];
  crons?: string[];
}

const normPrefix = (p: string) => p.trim().replace(/^\.?\/+/, '');

/** Keeps at most `max` strings (clipped) and reports how many were left out. */
function capList(items: readonly string[], max: number): { kept: string[]; omitted: number } {
  return { kept: items.slice(0, max).map((x) => clip(x, FILE_CLIP)), omitted: Math.max(0, items.length - max) };
}

/** Drops trailing callers until the serialized row fits `budget` chars. */
function fitRow(row: Row, budget: number): Row {
  const out = { ...row, callers: [...row.callers] };
  while (out.callers.length > 1 && JSON.stringify(out).length > budget) {
    out.callers.pop();
    out.callers_omitted = row.callers.length - out.callers.length;
  }
  // Endpoint/cron strings are free text from repo code; trim them too if callers alone do not fit.
  for (const key of ['endpoints', 'crons'] as const) {
    if (!out[key]) continue;
    const list = (out[key] = [...out[key]!]);
    while (list.length > 0 && JSON.stringify(out).length > budget) list.pop();
  }
  return out;
}

export const getBlastRadiusTool = {
  name: 'get_blast_radius' as const,
  config: {
    description: TOOL_DESCRIPTIONS.get_blast_radius,
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler:
    (deps: Deps) =>
    async (args: { repo: string; pr: number; path?: string }, extra: Extra) => {
      try {
        const { prId } = await resolvePr(deps.api, args.repo, args.pr, extra.signal);
        const res = await deps.api.get(idPath('/pulls', prId, '/blast'), BlastLite, extra.signal);

        const prefix = args.path ? normPrefix(args.path) : '';
        const declared = new Map(res.changed_symbols.map((c) => [c.name, c.file]));
        const inScope = (file: string | undefined) => !prefix || (file ?? '').startsWith(prefix);
        const symbols = res.changed_symbols.filter((c) => inScope(c.file));
        const impacts = res.downstream.filter((d) => inScope(declared.get(d.symbol)));

        const rowBudget = MAX_RESULT_CHARS - BLAST_ENVELOPE_CHARS;
        const rows: Row[] = impacts.map((d) => {
          const callers = d.callers.map((c) => `${clip(c.name, TEXT_CLIP)} ${clip(c.file, FILE_CLIP)}:${c.line}`);
          const ep = capList(d.endpoints_affected, BLAST_MAX_FACTS);
          const cr = capList(d.crons_affected, BLAST_MAX_FACTS);
          return fitRow(
            compact({
              symbol: clip(d.symbol, TEXT_CLIP),
              file: declared.has(d.symbol) ? clip(declared.get(d.symbol), FILE_CLIP) : undefined,
              callers,
              endpoints: ep.kept,
              crons: cr.kept,
            }) as Row,
            rowBudget,
          );
        });
        const page = paginate(rows, undefined, BLAST_PAGE_SIZE, rowBudget);

        const withCallers = new Set(impacts.map((d) => d.symbol));
        const without = symbols.filter((c) => !withCallers.has(c.name)).map((c) => c.name);
        const noCallers = capList(without, BLAST_MAX_NO_CALLER_NAMES);

        const hints: string[] = [];
        if (res.degraded) {
          hints.push(
            `index degraded${res.degraded_reason ? ` (${clip(res.degraded_reason, 40)})` : ''}; results may be incomplete; resync the repo index in the DevDigest web UI, then retry`,
          );
        }
        if (prefix && symbols.length === 0) {
          hints.push('no changed symbols under path; omit path or use a prefix of a changed file');
        } else if (!res.degraded && rows.length === 0) {
          hints.push('no downstream callers found for the changed symbols');
        }
        if (page.truncated) {
          hints.push(`showing ${page.items.length} of ${rows.length} symbols; pass path to narrow`);
        }

        return jsonResult(
          compact({
            summary: prefix ? undefined : clip(res.summary, TEXT_CLIP),
            changed_symbols: symbols.length,
            degraded: res.degraded ? true : undefined,
            symbols: page.items,
            untrusted: symbols.length > 0 ? UNTRUSTED_NOTE : undefined,
            no_callers: noCallers.kept,
            no_callers_omitted: noCallers.omitted > 0 ? noCallers.omitted : undefined,
            truncated: page.truncated ? true : undefined,
            hint: hints.length > 0 ? hints.join('; ') : undefined,
          }),
        );
      } catch (err) {
        return toErrorResult(err);
      }
    },
};
