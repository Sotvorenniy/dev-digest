import { z } from 'zod';
import { ApiError, idPath } from '../api/client.js';
import { ReviewLite, RunLite, RunPostResponse } from '../api/schemas.js';
import {
  MAX_AGENTS,
  MAX_RESULT_CHARS,
  POLL_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  RUN_BUDGET_MS,
  RUN_TOP_FINDINGS,
  TEXT_CLIP,
  UNTRUSTED_NOTE,
} from '../constants.js';
import { errorResult, jsonResult, toErrorResult } from '../errors.js';
import { clip, compact, paginate } from '../format.js';
import { resolveAgent, resolvePr } from '../resolve.js';
import { TOOL_DESCRIPTIONS } from './descriptions.js';
import { collectFindings } from './findings-shared.js';
import { prParam, repoParam } from './params.js';
import type { Deps, Extra } from './types.js';

const inputSchema = {
  repo: repoParam,
  pr: prParam,
  agent: z
    .string()
    .max(200)
    .optional()
    .describe('Agent name or id from list_agents; omit to run all enabled agents'),
};

// Budget split of MAX_RESULT_CHARS: runs, envelope (status, next, note), findings get the rest.
const RUNS_BUDGET_CHARS = 5_000;
const ENVELOPE_CHARS = 600;

const RunList = z.array(RunLite);
const ReviewList = z.array(ReviewLite);

export const runAgentOnPrTool = {
  name: 'run_agent_on_pr' as const,
  config: {
    description: TOOL_DESCRIPTIONS.run_agent_on_pr,
    inputSchema,
    // The only mutating tool: it starts runs. It never cancels one.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  handler:
    (deps: Deps) =>
    async (args: { repo: string; pr: number; agent?: string }, extra: Extra) => {
      const started = deps.now();
      const deadline = started + RUN_BUDGET_MS;
      const outer = extra.signal;
      let runIds: string[] = [];
      const elapsed = () => Math.round((deps.now() - started) / 1000);
      const stillRunning = (note?: string) =>
        jsonResult({
          status: 'running',
          run_ids: runIds,
          elapsed_s: elapsed(),
          next: note ?? 'call get_findings with repo, pr and run_id; do not re-run',
        });

      try {
        const { prId } = await resolvePr(deps.api, args.repo, args.pr, outer);
        const body = args.agent
          ? { agentId: (await resolveAgent(deps.api, args.agent, outer)).id }
          : { all: true };
        const posted = await deps.api.post(idPath('/pulls', prId, '/review'), body, RunPostResponse, outer);
        runIds = posted.runs.map((r) => r.run_id);
        if (runIds.length === 0) {
          return errorResult('no runs started; enable an agent or pass agent, then call list_agents');
        }
        const ids = new Set(runIds);
        const names = new Map(posted.runs.map((r) => [r.run_id, r.agent_name ?? r.agent_id]));

        // Poll until no returned run is `running` or the budget is spent.
        let finished: z.infer<typeof RunList> | null = null;
        for (;;) {
          if (outer?.aborted) {
            // The caller gave up; the runs keep going server-side.
            return stillRunning('request cancelled; runs continue: call get_findings later with run_id');
          }
          const remaining = deadline - deps.now();
          if (remaining <= 0) break;
          const pollSignal = AbortSignal.any([
            AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
            ...(outer ? [outer] : []),
          ]);
          try {
            const runs = await deps.api.get(idPath('/pulls', prId, '/runs'), RunList, pollSignal);
            const mine = runs.filter((r) => ids.has(r.run_id));
            if (mine.length === ids.size && mine.every((r) => r.status !== 'running')) {
              finished = mine;
              break;
            }
          } catch (err) {
            // Rate limits, timeouts and transient errors on a poll keep waiting.
            if (!(err instanceof ApiError)) throw err;
            if (err.kind === 'unreachable') throw err;
          }
          const left = deadline - deps.now();
          if (left <= 0) break;
          await deps.sleep(Math.min(POLL_INTERVAL_MS, left));
        }
        if (!finished) return stillRunning();

        const reviews = await deps.api.get(idPath('/pulls', prId, '/reviews'), ReviewList, outer);
        const mineReviews = reviews.filter((r) => r.run_id != null && ids.has(r.run_id));
        const { findings, dismissed } = collectFindings(mineReviews);
        const runsOut = finished.map((run) => {
          const review = mineReviews.find((r) => r.run_id === run.run_id);
          const counts: Record<string, number> = {};
          for (const f of review?.findings ?? []) {
            if (f.dismissed_at) continue;
            counts[f.severity] = (counts[f.severity] ?? 0) + 1;
          }
          return compact({
            agent: run.agent_name ?? names.get(run.run_id),
            run_id: run.run_id,
            status: run.status,
            verdict: review?.verdict,
            score: review?.score ?? run.score,
            counts: Object.keys(counts).length ? counts : undefined,
            error: run.error ? clip(run.error, TEXT_CLIP) : undefined,
          });
        });
        // Both lists are size-capped so the whole result stays under MAX_RESULT_CHARS.
        const runsPage = paginate(runsOut, undefined, MAX_AGENTS, RUNS_BUDGET_CHARS);
        const top = paginate(
          findings,
          undefined,
          RUN_TOP_FINDINGS,
          MAX_RESULT_CHARS - RUNS_BUDGET_CHARS - ENVELOPE_CHARS,
        ).items;
        const more = findings.length - top.length;
        const hasErrorText = runsPage.items.some((r) => r.error);
        return jsonResult(
          compact({
            status: 'done',
            runs: runsPage.items,
            runs_omitted: runsPage.truncated ? runsOut.length - runsPage.items.length : undefined,
            findings: top,
            more: more > 0 ? more : undefined,
            dismissed: dismissed > 0 ? dismissed : undefined,
            next: more > 0 ? 'call get_findings with repo and pr for the full list' : undefined,
            untrusted: top.length > 0 || hasErrorText ? UNTRUSTED_NOTE : undefined,
          }),
        );
      } catch (err) {
        // After the POST the runs exist: never drop their ids on a late failure.
        if (runIds.length > 0 && !(err instanceof ApiError && err.kind === 'rate_limited')) {
          const base = toErrorResult(err).content[0]?.text ?? 'error';
          return errorResult(`${base}; runs ${runIds.join(', ')} may still be running: call get_findings with run_id (do not re-run)`);
        }
        return toErrorResult(err);
      }
    },
};
