import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { FindingLite, ReviewLite } from '../src/api/schemas.js';
import { createApiClient } from '../src/api/client.js';
import { loadConfig } from '../src/config.js';
import { MAX_RESULT_CHARS, UNTRUSTED_NOTE } from '../src/constants.js';
import { latestReviewPerAgent, paginate, trimFinding } from '../src/format.js';
import { log } from '../src/log.js';
import {
  AGENT_ID, BASE, PR_ID, REPO_ID, RUN_A, RUN_B, connect, finding, jsonOf, repoRoutes, review, textOf,
  type RouteValue,
} from './helpers/fake-api.js';

const ARGS = { repo: 'acme/api', pr: 7 };
const clipped = (n: number) => `${'x'.repeat(n)}…`;

describe('format: review fixes', () => {
  it('trimFinding clips title to 200 and file to 300', () => {
    const t = trimFinding(finding({ title: 't'.repeat(500), file: 'f'.repeat(900) }) as unknown as FindingLite);
    expect(t.title).toBe(`${'t'.repeat(200)}…`);
    expect(t.file).toBe(`${'f'.repeat(300)}…`);
  });

  it('paginate shrinks an oversized first item instead of dropping it', () => {
    const items = [{ id: 'a', title: 'y'.repeat(5000) }, { id: 'b', title: 'z'.repeat(5000) }];
    const p = paginate(items, undefined, 20, 1000);
    // Item 'a' is shrunk to ~230 chars; 'b' is oversized and not first, so it is left for the next page.
    expect(p.items).toHaveLength(1);
    expect(p.items[0]?.id).toBe('a');
    expect(p.items[0]?.title).toBe(`${'y'.repeat(200)}…`);
    expect(JSON.stringify(p.items).length).toBeLessThanOrEqual(1000);
    expect(p.truncated).toBe(true);
    expect(p.next_cursor).toBe('1');
  });

  it('latestReviewPerAgent keeps two null-agent reviews as separate buckets', () => {
    const rs = [
      review({ id: 'n1', agent_id: null, created_at: '2026-01-01T00:00:00Z' }),
      review({ id: 'n2', agent_id: null, created_at: '2026-03-01T00:00:00Z' }),
    ] as unknown as ReviewLite[];
    expect(latestReviewPerAgent(rs).map((r) => r.id).sort()).toEqual(['n1', 'n2']);
  });
});

describe('config: review fixes', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['credentials', 'http://user:pass@localhost:3001', /credentials.*remove/i],
    ['query', 'http://localhost:3001/?token=abc', /query or fragment/],
    ['fragment', 'http://localhost:3001/#frag', /query or fragment/],
  ])('rejects %s with a message naming the fix', (_l, value, re) => {
    expect(() => loadConfig({ DEVDIGEST_API: value })).toThrow(re);
    expect(() => loadConfig({ DEVDIGEST_API: value })).toThrow(/set it to e\.g\./);
  });

  it('baseUrl is origin + pathname with trailing slashes trimmed', () => {
    expect(loadConfig({ DEVDIGEST_API: 'http://localhost:4000/api/v1///' }).baseUrl).toBe('http://localhost:4000/api/v1');
    expect(loadConfig({ DEVDIGEST_API: 'HTTP://LOCALHOST:4000/' }).baseUrl).toBe('http://localhost:4000');
  });

  it('never writes credentials to stderr, including via the warn logger', () => {
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    let message = '';
    try {
      loadConfig({ DEVDIGEST_API: 'https://user:s3cret@api.example.com' }, log);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/credentials/);
    expect(message).not.toContain('s3cret');
    // A valid non-loopback host warns on stderr, still without secrets.
    loadConfig({ DEVDIGEST_API: 'https://api.example.com/x' }, log);
    const written = err.mock.calls.map((c) => String(c[0])).join('');
    expect(written).toContain('api.example.com');
    expect(written).not.toContain('s3cret');
    expect(written).not.toContain('user:');
  });
});

describe('http client: review fixes', () => {
  it('uses redirect: "error" on GET and POST', async () => {
    const seen: RequestInit[] = [];
    const fetch = (async (_u: unknown, init?: RequestInit) => {
      seen.push(init as RequestInit);
      return new Response('{"a":1}', { status: 200 });
    }) as typeof globalThis.fetch;
    const api = createApiClient({ baseUrl: BASE, fetch });
    await api.get('/x', z.object({ a: z.number() }));
    await api.post('/x', { b: 1 }, z.object({ a: z.number() }));
    expect(seen.map((i) => i.redirect)).toEqual(['error', 'error']);
  });
});

const reviewsPath = `GET /pulls/${PR_ID}/reviews`;
const runsPath = `GET /pulls/${PR_ID}/runs`;
const fRoutes = (reviews: unknown[], runs: unknown[] = []): Record<string, RouteValue> => ({
  ...repoRoutes(),
  [reviewsPath]: { body: reviews },
  [runsPath]: { body: runs },
});

describe('get_findings: review fixes', () => {
  const summary = review({
    id: 'sum', kind: 'summary', created_at: '2026-05-01T00:00:00Z', findings: [finding({ id: 'from-summary' })],
  });
  const agentRev = review({ id: 'ag', created_at: '2026-01-01T00:00:00Z', findings: [finding({ id: 'from-agent' })] });

  it('drops summary reviews on the default path before newest-per-agent', async () => {
    // The summary is newer and shares the agent_id: if it were not dropped first it would win.
    const h = await connect(fRoutes([agentRev, summary]));
    const out = jsonOf(await h.call('get_findings', ARGS));
    expect(out.findings.map((f: { id: string }) => f.id)).toEqual(['from-agent']);
  });

  it('keeps a summary review when run_id selects it', async () => {
    const h = await connect(fRoutes([agentRev, { ...summary, run_id: RUN_B }]));
    const out = jsonOf(await h.call('get_findings', { ...ARGS, run_id: RUN_B }));
    expect(out.findings.map((f: { id: string }) => f.id)).toEqual(['from-summary']);
  });

  it('clips a failed run error to 200 and adds the untrusted note', async () => {
    const h = await connect(fRoutes([], [{ run_id: RUN_A, status: 'failed', error: `${'e'.repeat(600)}` }]));
    const out = jsonOf(await h.call('get_findings', { ...ARGS, run_id: RUN_A }));
    expect(out.error).toBe(`${'e'.repeat(200)}…`);
    expect(out.untrusted).toBe(UNTRUSTED_NOTE);
  });

  it('a failed run without error text carries no untrusted note', async () => {
    const h = await connect(fRoutes([], [{ run_id: RUN_A, status: 'failed' }]));
    const out = jsonOf(await h.call('get_findings', { ...ARGS, run_id: RUN_A }));
    expect(out.untrusted).toBeUndefined();
  });
});

describe('run_agent_on_pr: review fixes', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

  function runRoutes(n: number, opts: { error?: string; reviews?: unknown[] } = {}): Record<string, RouteValue> {
    const rid = ids(n);
    return {
      ...repoRoutes(),
      [`POST /pulls/${PR_ID}/review`]: {
        body: { runs: rid.map((run_id, i) => ({ run_id, agent_id: AGENT_ID, agent_name: `Agent${i}` })) },
      },
      [runsPath]: {
        body: rid.map((run_id, i) => ({
          run_id, agent_name: `Agent${i}`, status: opts.error ? 'failed' : 'done', error: opts.error,
        })),
      },
      [reviewsPath]: { body: opts.reviews ?? [] },
    };
  }

  it('stays under MAX_RESULT_CHARS with many runs and huge titles; runs_omitted reports the cap', async () => {
    const rid = ids(40);
    const reviews = rid.map((run_id, i) =>
      review({
        id: `r${i}`, run_id, agent_id: `agent-${i}`, agent_name: `Agent${i}`,
        findings: [finding({ id: `f${i}`, title: 'T'.repeat(5000), file: 'F'.repeat(5000), rationale: 'R'.repeat(5000) })],
      }),
    );
    const h = await connect(runRoutes(40, { error: 'E'.repeat(1000), reviews }));
    const res = await h.call('run_agent_on_pr', ARGS);
    const text = textOf(res);
    expect(text.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
    const out = jsonOf(res);
    expect(out.runs.length).toBeLessThan(40);
    expect(out.runs_omitted).toBe(40 - out.runs.length);
    expect(out.runs.every((r: { error: string }) => r.error === `${'E'.repeat(200)}…`)).toBe(true);
  });

  it('omits runs_omitted when every run fits', async () => {
    const h = await connect(runRoutes(3));
    const out = jsonOf(await h.call('run_agent_on_pr', ARGS));
    expect(out.runs).toHaveLength(3);
    expect(out.runs_omitted).toBeUndefined();
  });

  it('adds the untrusted note when only run errors are included', async () => {
    const h = await connect(runRoutes(1, { error: 'boom from llm' }));
    const out = jsonOf(await h.call('run_agent_on_pr', ARGS));
    expect(out.findings).toBeUndefined();
    expect(out.runs[0].error).toBe('boom from llm');
    expect(out.untrusted).toBe(UNTRUSTED_NOTE);
  });

  it('has no untrusted note without findings or error text', async () => {
    const h = await connect(runRoutes(1));
    expect(jsonOf(await h.call('run_agent_on_pr', ARGS)).untrusted).toBeUndefined();
  });
});

describe('get_conventions: review fixes', () => {
  const cand = (i: number, status = 'accepted', rule = `rule ${i}`) => ({
    id: `c${i}`, rule, evidence_path: 'a.ts', status, category: 'style', confidence: 0.5,
  });
  const convRoutes = (candidates: unknown[], scan: Record<string, unknown> = { status: 'done' }) => ({
    ...repoRoutes(),
    [`GET /repos/${REPO_ID}/conventions`]: { body: { candidates, scan } },
  });

  it('pages 25 per page with next_cursor', async () => {
    const h = await connect(convRoutes(Array.from({ length: 30 }, (_, i) => cand(i))));
    const p1 = jsonOf(await h.call('get_conventions', { repo: 'acme/api' }));
    expect(p1.conventions).toHaveLength(25);
    expect(p1.truncated).toBe(true);
    expect(p1.next_cursor).toBe('25');
    const p2 = jsonOf(await h.call('get_conventions', { repo: 'acme/api', cursor: p1.next_cursor }));
    expect(p2.conventions.map((c: { rule: string }) => c.rule)).toEqual(
      Array.from({ length: 5 }, (_, i) => `rule ${25 + i}`),
    );
    expect(p2.truncated).toBeUndefined();
    expect(p2.next_cursor).toBeUndefined();
  });

  it('never_run scan with no rules hints at starting a scan', async () => {
    const h = await connect(convRoutes([], { status: 'never_run' }));
    const out = jsonOf(await h.call('get_conventions', { repo: 'acme/api' }));
    expect(out.hint).toBe('no scan has run for this repo; start a convention scan in the DevDigest web UI');
    expect(out.scan).toEqual({ status: 'never_run' });
    expect(out.untrusted).toBeUndefined();
  });

  it('caps the result at 12K chars when rules are huge', async () => {
    const h = await connect(convRoutes(Array.from({ length: 25 }, (_, i) => cand(i, 'accepted', 'R'.repeat(5000)))));
    const res = await h.call('get_conventions', { repo: 'acme/api' });
    expect(textOf(res).length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
    const out = jsonOf(res);
    expect(out.conventions).toHaveLength(25);
    expect(out.conventions[0].rule).toBe(clipped(200).replace(/x/g, 'R'));
  });

  it('clips scan.error to 200 and adds the untrusted note even with no rules', async () => {
    const h = await connect(convRoutes([], { status: 'failed', error: 'S'.repeat(700) }));
    const out = jsonOf(await h.call('get_conventions', { repo: 'acme/api' }));
    expect(out.scan.error).toBe(`${'S'.repeat(200)}…`);
    expect(out.untrusted).toBe(UNTRUSTED_NOTE);
  });
});

describe('list_agents: review fixes', () => {
  const agents = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `A${i}`, enabled: true, description: 'd'.repeat(300) }));

  it('truncates at 50 agents and sets truncated, clipping descriptions to 100', async () => {
    const h = await connect({ 'GET /agents': { body: agents(60) } });
    const out = jsonOf(await h.call('list_agents', {}));
    expect(out.agents).toHaveLength(50);
    expect(out.truncated).toBe(true);
    expect(out.agents[0].description).toBe(`${'d'.repeat(100)}…`);
  });

  it('exactly 50 agents is not truncated', async () => {
    const h = await connect({ 'GET /agents': { body: agents(50) } });
    const out = jsonOf(await h.call('list_agents', {}));
    expect(out.agents).toHaveLength(50);
    expect(out.truncated).toBeUndefined();
  });
});
