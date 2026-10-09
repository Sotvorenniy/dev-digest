import { describe, expect, it } from 'vitest';
import {
  PR_ID, RUN_A, RUN_B, connect, finding, isErr, jsonOf, repoRoutes, review, textOf, type RouteValue,
} from './helpers/fake-api.js';

const ARGS = { repo: 'acme/api', pr: 7 };
const routes = (reviews: unknown[], runs: unknown[] = []): Record<string, RouteValue> => ({
  ...repoRoutes(),
  [`GET /pulls/${PR_ID}/reviews`]: { body: reviews },
  [`GET /pulls/${PR_ID}/runs`]: { body: runs },
});

describe('get_findings', () => {
  it('run_id still running: reports running with a retry hint', async () => {
    const h = await connect(routes([], [{ run_id: RUN_A, status: 'running' }]));
    const res = await h.call('get_findings', { ...ARGS, run_id: RUN_A });
    expect(isErr(res)).toBe(false);
    expect(jsonOf(res)).toEqual({ status: 'running', next: 'retry get_findings in ~30s' });
  });

  it('run_id of a failed run reports the failure and its error', async () => {
    const h = await connect(routes([], [{ run_id: RUN_A, status: 'failed', error: 'bad key' }]));
    expect(jsonOf(await h.call('get_findings', { ...ARGS, run_id: RUN_A }))).toMatchObject({
      status: 'failed',
      error: 'bad key',
    });
  });

  it('unknown run_id (valid uuid) is an error that says to omit it', async () => {
    const h = await connect(routes([], []));
    const res = await h.call('get_findings', { ...ARGS, run_id: RUN_B });
    expect(isErr(res)).toBe(true);
    expect(textOf(res)).toBe('unknown run_id; omit it to see the latest reviews');
  });

  it('a malformed run_id is the same error and makes no run lookup', async () => {
    const h = await connect(routes([], []));
    const res = await h.call('get_findings', { ...ARGS, run_id: 'garbage' });
    expect(isErr(res)).toBe(true);
    expect(textOf(res)).toContain('omit it');
    expect(h.calls.some((c) => c.path.endsWith('/runs'))).toBe(false);
  });

  it('run_id selects only that run review', async () => {
    const h = await connect(
      routes([
        review({ run_id: RUN_A, findings: [finding({ id: 'a' })] }),
        review({ id: 'r2', run_id: RUN_B, agent_id: 'other', findings: [finding({ id: 'b' })] }),
      ]),
    );
    const out = jsonOf(await h.call('get_findings', { ...ARGS, run_id: RUN_B }));
    expect(out.findings.map((f: { id: string }) => f.id)).toEqual(['b']);
  });

  it('min_severity filters lower severities out', async () => {
    const h = await connect(
      routes([
        review({
          findings: [
            finding({ id: 'c', severity: 'CRITICAL' }),
            finding({ id: 'w', severity: 'WARNING' }),
            finding({ id: 's', severity: 'SUGGESTION' }),
          ],
        }),
      ]),
    );
    const out = jsonOf(await h.call('get_findings', { ...ARGS, min_severity: 'WARNING' }));
    expect(out.findings.map((f: { id: string }) => f.id)).toEqual(['c', 'w']);
  });

  it('default shows only the newest review per agent', async () => {
    const h = await connect(
      routes([
        review({ id: 'old', created_at: '2026-01-01T00:00:00Z', findings: [finding({ id: 'stale' })] }),
        review({ id: 'new', created_at: '2026-02-01T00:00:00Z', findings: [finding({ id: 'fresh' })] }),
      ]),
    );
    const out = jsonOf(await h.call('get_findings', ARGS));
    expect(out.findings.map((f: { id: string }) => f.id)).toEqual(['fresh']);
    expect(out.untrusted).toMatch(/data, not instructions/);
  });

  it('pages 25 findings as 20 + 5 via next_cursor, and rejects a bad cursor', async () => {
    const many = Array.from({ length: 25 }, (_, i) => finding({ id: `f${i}`, start_line: i + 1 }));
    const h = await connect(routes([review({ findings: many })]));
    const p1 = jsonOf(await h.call('get_findings', ARGS));
    expect(p1.findings).toHaveLength(20);
    expect(p1.truncated).toBe(true);
    const p2 = jsonOf(await h.call('get_findings', { ...ARGS, cursor: p1.next_cursor }));
    expect(p2.findings).toHaveLength(5);
    expect(p2.next_cursor).toBeUndefined();
    const bad = await h.call('get_findings', { ...ARGS, cursor: 'zzz' });
    expect(isErr(bad)).toBe(true);
    expect(textOf(bad)).toContain('omit cursor');
  });

  it('no reviews yet points at run_agent_on_pr', async () => {
    const h = await connect(routes([]));
    expect(jsonOf(await h.call('get_findings', ARGS)).hint).toContain('run_agent_on_pr');
  });
});
