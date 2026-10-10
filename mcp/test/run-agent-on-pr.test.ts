import { describe, expect, it } from 'vitest';
import { RUN_BUDGET_MS } from '../src/constants.js';
import {
  AGENT_ID, PR_ID, RUN_A, RUN_B, RUN_OTHER, connect, finding, isErr, jsonOf, repoRoutes, review, textOf,
  type RouteValue,
} from './helpers/fake-api.js';

const ARGS = { repo: 'acme/api', pr: 7 };
const runRow = (status: string, extra: Record<string, unknown> = {}) => ({
  run_id: RUN_A, agent_name: 'Security', status, ...extra,
});

function routes(over: Record<string, RouteValue> = {}): Record<string, RouteValue> {
  return {
    ...repoRoutes(),
    [`POST /pulls/${PR_ID}/review`]: { body: { runs: [{ run_id: RUN_A, agent_id: AGENT_ID, agent_name: 'Security' }] } },
    [`GET /pulls/${PR_ID}/runs`]: { body: [runRow('done', { score: 80 })] },
    [`GET /pulls/${PR_ID}/reviews`]: { body: [review()] },
    ...over,
  };
}
const cancels = (calls: { path: string }[]) => calls.filter((c) => /cancel/.test(c.path));

describe('run_agent_on_pr', () => {
  it('happy path: POST {all:true}, polls running,running,done, filters reviews by run_id', async () => {
    const h = await connect(
      routes({
        [`GET /pulls/${PR_ID}/runs`]: (_r, n) => ({ body: [runRow(n < 3 ? 'running' : 'done')] }),
        [`GET /pulls/${PR_ID}/reviews`]: {
          body: [
            review({ findings: [finding({ id: 'mine', severity: 'CRITICAL' }), finding({ id: 'gone', dismissed_at: 'x' })] }),
            review({ id: 'r2', run_id: RUN_OTHER, findings: [finding({ id: 'foreign' })] }),
          ],
        },
      }),
    );
    const res = await h.call('run_agent_on_pr', ARGS);
    expect(isErr(res)).toBe(false);
    const out = jsonOf(res);
    expect(out.status).toBe('done');
    expect(out.findings.map((f: { id: string }) => f.id)).toEqual(['mine']);
    expect(out.dismissed).toBe(1);
    expect(out.runs[0]).toMatchObject({ agent: 'Security', status: 'done', verdict: 'comment', counts: { CRITICAL: 1 } });
    const post = h.calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ all: true });
    expect(h.calls.filter((c) => c.path.endsWith('/runs'))).toHaveLength(3);
    expect(h.clock.sleeps).toEqual([2000, 2000]);
    expect(cancels(h.calls)).toHaveLength(0);
  });

  it('a given agent (case-insensitive name) sends {agentId}', async () => {
    const h = await connect(routes({ 'GET /agents': { body: [{ id: AGENT_ID, name: 'Security', enabled: true }] } }));
    await h.call('run_agent_on_pr', { ...ARGS, agent: 'SECURITY' });
    expect(h.calls.find((c) => c.method === 'POST')?.body).toEqual({ agentId: AGENT_ID });
  });

  it('an unknown agent errors toward list_agents and starts no run', async () => {
    const h = await connect(routes({ 'GET /agents': { body: [] } }));
    const res = await h.call('run_agent_on_pr', { ...ARGS, agent: 'ghost' });
    expect(isErr(res)).toBe(true);
    expect(textOf(res)).toContain('list_agents');
    expect(h.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('a failed run shows its error and is not a tool error', async () => {
    const h = await connect(
      routes({
        [`GET /pulls/${PR_ID}/runs`]: { body: [runRow('failed', { error: 'llm exploded' })] },
        [`GET /pulls/${PR_ID}/reviews`]: { body: [] },
      }),
    );
    const res = await h.call('run_agent_on_pr', ARGS);
    expect(isErr(res)).toBe(false);
    expect(jsonOf(res).runs[0]).toMatchObject({ status: 'failed', error: 'llm exploded' });
  });

  it('waits for ALL returned runs, not only the first', async () => {
    const h = await connect(
      routes({
        [`POST /pulls/${PR_ID}/review`]: {
          body: { runs: [{ run_id: RUN_A, agent_id: AGENT_ID }, { run_id: RUN_B, agent_id: AGENT_ID }] },
        },
        [`GET /pulls/${PR_ID}/runs`]: (_r, n) => ({
          body: [runRow('done'), { run_id: RUN_B, status: n < 2 ? 'running' : 'done' }],
        }),
      }),
    );
    expect(jsonOf(await h.call('run_agent_on_pr', ARGS)).status).toBe('done');
    expect(h.calls.filter((c) => c.path.endsWith('/runs'))).toHaveLength(2);
  });

  it('timeout is not an error, returns run_ids and the get_findings hint, never cancels', async () => {
    const h = await connect(routes({ [`GET /pulls/${PR_ID}/runs`]: { body: [runRow('running')] } }));
    const res = await h.call('run_agent_on_pr', ARGS);
    expect(isErr(res)).toBe(false);
    const out = jsonOf(res);
    expect(out.status).toBe('running');
    expect(out.run_ids).toEqual([RUN_A]);
    expect(out.next).toContain('get_findings');
    expect(out.next).toContain('do not re-run');
    expect(out.elapsed_s).toBe(RUN_BUDGET_MS / 1000);
    expect(cancels(h.calls)).toHaveLength(0);
    expect(h.calls.every((c) => c.method === 'GET' || c.path.endsWith('/review'))).toBe(true);
    expect(h.calls.some((c) => c.path.endsWith('/reviews'))).toBe(false);
  });

  it('429 on a poll keeps waiting instead of failing', async () => {
    const h = await connect(
      routes({
        [`GET /pulls/${PR_ID}/runs`]: (_r, n) =>
          n === 1 ? { status: 429, body: {} } : { body: [runRow('done')] },
      }),
    );
    expect(jsonOf(await h.call('run_agent_on_pr', ARGS)).status).toBe('done');
  });

  it('429 on POST gives a short isError that says to wait and retry', async () => {
    const h = await connect(routes({ [`POST /pulls/${PR_ID}/review`]: { status: 429, body: {} } }));
    const res = await h.call('run_agent_on_pr', ARGS);
    expect(isErr(res)).toBe(true);
    expect(textOf(res).length).toBeLessThan(120);
    expect(textOf(res)).toMatch(/wait .*retry/);
  });

  it('an outer abort mid-poll returns the run ids and does not cancel', async () => {
    const { runAgentOnPrTool } = await import('../src/tools/run-agent-on-pr.js');
    const { createApiClient } = await import('../src/api/client.js');
    const { fakeFetch, fakeClock, BASE } = await import('./helpers/fake-api.js');
    const ac = new AbortController();
    const f = fakeFetch(
      routes({
        [`GET /pulls/${PR_ID}/runs`]: () => {
          ac.abort();
          return { body: [runRow('running')] };
        },
      }),
    );
    const clock = fakeClock();
    const handler = runAgentOnPrTool.handler({
      api: createApiClient({ baseUrl: BASE, fetch: f.fetch }),
      sleep: clock.sleep,
      now: clock.now,
    });
    const res = await handler(ARGS, { signal: ac.signal });
    expect(isErr(res)).toBe(false);
    expect(jsonOf(res).run_ids).toEqual([RUN_A]);
    expect(jsonOf(res).status).toBe('running');
    expect(cancels(f.calls)).toHaveLength(0);
  });

  it('a failure after the POST keeps the run ids and says not to re-run', async () => {
    const h = await connect(
      routes({ [`GET /pulls/${PR_ID}/reviews`]: { status: 500, raw: 'boom' } }),
    );
    const res = await h.call('run_agent_on_pr', ARGS);
    expect(isErr(res)).toBe(true);
    expect(textOf(res)).toContain(RUN_A);
    expect(textOf(res)).toContain('do not re-run');
  });
});
