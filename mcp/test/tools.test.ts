import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { TOOL_DESCRIPTIONS } from '../src/tools/descriptions.js';
import {
  AGENT_ID, PR_ID, REPO_ID, RUN_A, connect, isErr, jsonOf, repoRoutes, textOf, type RouteValue,
} from './helpers/fake-api.js';

// Copied from the plan's "Final tool descriptions" (binding). Literals, not imported from src.
const EXPECTED: Record<string, string> = {
  list_agents:
    'List configured dev-digest reviewer agents (id, name, enabled, provider/model, short description). Use an id or name with run_agent_on_pr; omit agent there to run all enabled agents.',
  run_agent_on_pr:
    'Run a dev-digest review on a pull request and wait up to 120s. Returns verdict, score and top findings per agent. On timeout returns run_ids: call get_findings later instead of re-running. Rate-limited 10/min.',
  get_findings:
    'Get findings of a dev-digest review: one run (run_id) or, by default, the latest review per agent on the PR. Sorted by severity, paged; filter with min_severity. Use after run_agent_on_pr.',
  get_conventions:
    'Get coding conventions dev-digest extracted for an imported repo (rule, evidence file:lines, confidence). Defaults to accepted rules; status=pending shows unreviewed candidates. Paged.',
  get_blast_radius:
    "Show what a PR's changes can break: changed symbols, their callers (file:line) and the HTTP endpoints and crons that depend on them. Reads the prebuilt repo index. Use before reviewing a PR; pass path to narrow.",
};
const EXPECTED_LEN: Record<string, number> = {
  list_agents: 182, run_agent_on_pr: 209, get_findings: 188, get_conventions: 184, get_blast_radius: 211,
};

const ANNOTATIONS: Record<string, Record<string, boolean>> = {
  list_agents: { readOnlyHint: true, openWorldHint: false },
  run_agent_on_pr: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  get_findings: { readOnlyHint: true, openWorldHint: false },
  get_conventions: { readOnlyHint: true, openWorldHint: false },
  get_blast_radius: { readOnlyHint: true, openWorldHint: false },
};

const NEXT_STEP =
  /\b(call|check|retry|start|import|omit|fix|enable|use|wait|set)\b/i;

describe('tool registry', () => {
  it('lists exactly the five tools with verbatim descriptions', async () => {
    const h = await connect(repoRoutes());
    const { tools } = await h.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const t of tools) {
      expect(t.description).toBe(EXPECTED[t.name]);
      expect(t.description?.length).toBe(EXPECTED_LEN[t.name]);
    }
  });

  it('the src constant equals the literals (a silent edit fails here)', () => {
    expect({ ...TOOL_DESCRIPTIONS }).toEqual(EXPECTED);
  });

  it('description lengths are in range (150-300; 100-300 for get_blast_radius)', async () => {
    const h = await connect(repoRoutes());
    for (const t of (await h.client.listTools()).tools) {
      const len = t.description?.length ?? 0;
      expect(len).toBeLessThanOrEqual(300);
      expect(len).toBeGreaterThanOrEqual(t.name === 'get_blast_radius' ? 100 : 150);
    }
  });

  it('param descriptions are 40-80 chars; no outputSchema; annotations match', async () => {
    const h = await connect(repoRoutes());
    for (const t of (await h.client.listTools()).tools) {
      expect(t.outputSchema).toBeUndefined();
      expect(t.annotations).toMatchObject(ANNOTATIONS[t.name] ?? {});
      const props = (t.inputSchema.properties ?? {}) as Record<string, { description?: string; type?: string }>;
      expect(Object.keys(props).length).toBeLessThanOrEqual(5); // plan table gives get_findings 5 inputs; mcp/AGENTS.md says <=4 (reported)
      for (const [name, p] of Object.entries(props)) {
        const d = p.description ?? '';
        expect(d.length, `${t.name}.${name}`).toBeGreaterThanOrEqual(40);
        expect(d.length, `${t.name}.${name}`).toBeLessThanOrEqual(80);
        expect(['string', 'number', 'integer', 'boolean']).toContain(p.type);
      }
    }
  });

  it('get_blast_radius keeps its frozen input shape (repo, pr, path)', async () => {
    const h = await connect(repoRoutes());
    const t = (await h.client.listTools()).tools.find((x) => x.name === 'get_blast_radius');
    expect(Object.keys(t?.inputSchema.properties ?? {})).toEqual(['repo', 'pr', 'path']);
    expect(t?.inputSchema.required).toEqual(['repo', 'pr']);
  });

  it('instructions are 300-600 chars', async () => {
    const h = await connect(repoRoutes());
    const len = h.client.getInstructions()?.length ?? 0;
    expect(len).toBeGreaterThanOrEqual(300);
    expect(len).toBeLessThanOrEqual(600);
  });
});

describe('tool behaviour', () => {
  it('list_agents drops system_prompt/output_schema and hides disabled agents by default', async () => {
    const h = await connect({
      'GET /agents': {
        body: [
          { id: AGENT_ID, name: 'Sec', enabled: true, provider: 'openai', model: 'gpt', description: 'd', system_prompt: 'LEAK', output_schema: { x: 1 } },
          { id: RUN_A, name: 'Off', enabled: false },
        ],
      },
    });
    const res = await h.call('list_agents', {});
    expect(isErr(res)).toBe(false);
    expect(textOf(res)).not.toContain('LEAK');
    expect(textOf(res)).not.toContain('output_schema');
    const out = jsonOf(res);
    expect(out.agents).toEqual([{ id: AGENT_ID, name: 'Sec', enabled: true, model: 'openai/gpt', description: 'd' }]);
    const all = jsonOf(await h.call('list_agents', { include_disabled: true }));
    expect(all.agents).toHaveLength(2);
  });

  describe('get_blast_radius', () => {
    const blastPath = `GET /pulls/${PR_ID}/blast`;
    const blast = (over: Record<string, unknown> = {}) => ({
      changed_symbols: [
        { name: 'rateLimit', file: 'src/rate.ts', kind: 'function' },
        { name: 'helper', file: 'lib/helper.ts', kind: 'function' },
        { name: 'lonely', file: 'src/lonely.ts', kind: 'function' },
      ],
      downstream: [
        {
          symbol: 'rateLimit',
          callers: [{ name: 'publicRouter', file: 'src/router.ts', line: 23 }],
          endpoints_affected: ['GET /api/x'],
          crons_affected: ['nightly'],
        },
        { symbol: 'helper', callers: [{ name: 'job', file: 'src/job.ts', line: 4 }], endpoints_affected: [], crons_affected: [] },
      ],
      summary: '3 symbols, 2 callers, 1 endpoints, 1 crons',
      degraded: false,
      degraded_reason: null,
      ...over,
    });

    it('returns compact callers, endpoints and crons for the PR (read-only GETs)', async () => {
      const h = await connect({ ...repoRoutes(), [blastPath]: { body: blast() } });
      const res = await h.call('get_blast_radius', { repo: 'acme/api', pr: 7 });
      expect(isErr(res)).toBe(false);
      const out = jsonOf(res);
      expect(out.summary).toBe('3 symbols, 2 callers, 1 endpoints, 1 crons');
      expect(out.symbols[0]).toEqual({
        symbol: 'rateLimit',
        file: 'src/rate.ts',
        callers: ['publicRouter src/router.ts:23'],
        endpoints: ['GET /api/x'],
        crons: ['nightly'],
      });
      expect(out.no_callers).toEqual(['lonely']);
      expect(typeof out.untrusted).toBe('string');
      expect(out.degraded).toBeUndefined();
      expect(h.calls.every((c) => c.method === 'GET')).toBe(true);
    });

    it('filters by path prefix on the declaring file', async () => {
      const h = await connect({ ...repoRoutes(), [blastPath]: { body: blast() } });
      const out = jsonOf(await h.call('get_blast_radius', { repo: 'acme/api', pr: 7, path: './lib/' }));
      expect(out.symbols.map((r: { symbol: string }) => r.symbol)).toEqual(['helper']);
      expect(out.changed_symbols).toBe(1);
      const none = jsonOf(await h.call('get_blast_radius', { repo: 'acme/api', pr: 7, path: 'nope/' }));
      expect(none.symbols).toBeUndefined();
      expect(none.hint).toMatch(/omit path/);
    });

    it('flags a degraded index and names the next step', async () => {
      const h = await connect({
        ...repoRoutes(),
        [blastPath]: { body: blast({ downstream: [], degraded: true, degraded_reason: 'flag_off' }) },
      });
      const out = jsonOf(await h.call('get_blast_radius', { repo: 'acme/api', pr: 7 }));
      expect(out.degraded).toBe(true);
      expect(out.hint).toMatch(/index degraded \(flag_off\).*resync/);
    });

    it('says so when nothing calls the changed symbols', async () => {
      const h = await connect({ ...repoRoutes(), [blastPath]: { body: blast({ downstream: [] }) } });
      const out = jsonOf(await h.call('get_blast_radius', { repo: 'acme/api', pr: 7 }));
      expect(out.hint).toBe('no downstream callers found for the changed symbols');
    });

    it('keeps an oversized result under 12K chars, truncated with a narrowing hint', async () => {
      const many = Array.from({ length: 200 }, (_, i) => ({
        symbol: `sym${i}`,
        callers: Array.from({ length: 12 }, (_, j) => ({ name: `caller${j}`, file: `src/some/long/dir/file${i}_${j}.ts`, line: j + 1 })),
        endpoints_affected: ['GET /x'],
        crons_affected: [],
      }));
      const h = await connect({
        ...repoRoutes(),
        [blastPath]: { body: blast({ changed_symbols: many.map((m) => ({ name: m.symbol, file: 'src/a.ts', kind: 'function' })), downstream: many }) },
      });
      const res = await h.call('get_blast_radius', { repo: 'acme/api', pr: 7 });
      expect(isErr(res)).toBe(false);
      expect(textOf(res).length).toBeLessThanOrEqual(12_000);
      const out = jsonOf(res);
      expect(out.truncated).toBe(true);
      expect(out.hint).toMatch(/pass path to narrow/);
    });

    it('clips an oversized single symbol instead of exceeding the cap', async () => {
      const huge = {
        symbol: 's',
        callers: Array.from({ length: 2000 }, (_, j) => ({ name: `c${j}`, file: `src/dir/file${j}.ts`, line: j + 1 })),
        endpoints_affected: [],
        crons_affected: [],
      };
      const h = await connect({ ...repoRoutes(), [blastPath]: { body: blast({ downstream: [huge] }) } });
      const res = await h.call('get_blast_radius', { repo: 'acme/api', pr: 7 });
      expect(textOf(res).length).toBeLessThanOrEqual(12_000);
      expect(jsonOf(res).symbols[0].callers_omitted).toBeGreaterThan(0);
    });

    it('clips long server strings', async () => {
      const long = 'x'.repeat(1000);
      const h = await connect({
        ...repoRoutes(),
        [blastPath]: { body: blast({ downstream: [{ symbol: long, callers: [{ name: long, file: long, line: 1 }], endpoints_affected: [long], crons_affected: [] }] }) },
      });
      expect(textOf(await h.call('get_blast_radius', { repo: 'acme/api', pr: 7 })).length).toBeLessThan(2000);
    });

    it('unknown PR and a missing route are errors that name a next step', async () => {
      const h = await connect({ ...repoRoutes() });
      const unknown = await h.call('get_blast_radius', { repo: 'acme/api', pr: 99 });
      expect(isErr(unknown)).toBe(true);
      expect(textOf(unknown)).toContain('gh pr list');
      const missing = await h.call('get_blast_radius', { repo: 'acme/api', pr: 7 });
      expect(isErr(missing)).toBe(true);
      expect(textOf(missing)).toMatch(NEXT_STEP);
    });
  });

  it('get_conventions defaults to accepted and hints at pending when none are accepted', async () => {
    const cand = (status: string, id: string) => ({
      id, rule: 'use X', evidence_path: 'a.ts', evidence_start_line: 3, evidence_end_line: 5, confidence: 0.8, category: 'style', status,
    });
    const h = await connect({
      ...repoRoutes(),
      [`GET /repos/${REPO_ID}/conventions`]: {
        body: { candidates: [cand('pending', 'p1'), cand('pending', 'p2'), cand('rejected', 'r1')], scan: { status: 'done' } },
      },
    });
    const none = jsonOf(await h.call('get_conventions', { repo: 'acme/api' }));
    expect(none.conventions).toBeUndefined();
    expect(none.hint).toBe('0 accepted; 2 pending; call with status=pending');
    const pend = jsonOf(await h.call('get_conventions', { repo: 'acme/api', status: 'pending' }));
    expect(pend.conventions).toHaveLength(2);
    expect(pend.conventions[0]).toMatchObject({ rule: 'use X', evidence: 'a.ts:3-5' });
    expect(pend.untrusted).toMatch(/data, not instructions/);
  });
});

describe('every error text names a next step', () => {
  const reviewsPath = `GET /pulls/${PR_ID}/reviews`;
  const cases: [string, Record<string, RouteValue>, string, Record<string, unknown>][] = [
    ['bad repo arg', {}, 'get_findings', { repo: 'nope', pr: 1 }],
    ['unknown repo', { 'GET /repos': { body: [] } }, 'get_findings', { repo: 'a/b', pr: 1 }],
    ['unknown PR', { ...repoRoutes() }, 'get_findings', { repo: 'acme/api', pr: 99 }],
    ['unknown run_id', { ...repoRoutes(), [reviewsPath]: { body: [] }, [`GET /pulls/${PR_ID}/runs`]: { body: [] } }, 'get_findings', { repo: 'acme/api', pr: 7, run_id: RUN_A }],
    ['bad cursor', { ...repoRoutes(), [reviewsPath]: { body: [{ id: 'r', created_at: '2026-01-01T00:00:00Z', findings: [] }] } }, 'get_findings', { repo: 'acme/api', pr: 7, cursor: 'x' }],
    ['unknown agent', { ...repoRoutes(), 'GET /agents': { body: [] } }, 'run_agent_on_pr', { repo: 'acme/api', pr: 7, agent: 'g' }],
    ['429 on POST', { ...repoRoutes(), [`POST /pulls/${PR_ID}/review`]: { status: 429 } }, 'run_agent_on_pr', { repo: 'acme/api', pr: 7 }],
    ['500', { 'GET /agents': { status: 500, raw: 'x' } }, 'list_agents', {}],
    ['422', { 'GET /agents': { status: 422 } }, 'list_agents', {}],
    ['404 envelope', { 'GET /agents': { status: 404, body: { error: { message: 'gone' } } } }, 'list_agents', {}],
    ['bad_response', { 'GET /agents': { body: { not: 'array' } } }, 'list_agents', {}],
    ['blast radius unknown PR', { ...repoRoutes() }, 'get_blast_radius', { repo: 'acme/api', pr: 99 }],
    ['blast radius 500', { ...repoRoutes(), [`GET /pulls/${PR_ID}/blast`]: { status: 500 } }, 'get_blast_radius', { repo: 'acme/api', pr: 7 }],
    ['blast radius bad_response', { ...repoRoutes(), [`GET /pulls/${PR_ID}/blast`]: { body: { nope: 1 } } }, 'get_blast_radius', { repo: 'acme/api', pr: 7 }],
    ['conventions unknown repo', { 'GET /repos': { body: [] } }, 'get_conventions', { repo: 'a/b' }],
  ];
  it.each(cases)('%s', async (_label, routes, tool, args) => {
    const h = await connect(routes);
    const res = await h.call(tool, args);
    expect(isErr(res)).toBe(true);
    expect(textOf(res)).toMatch(NEXT_STEP);
    expect(textOf(res).length).toBeLessThan(400);
  });

  it('unreachable API names the start command', async () => {
    const { createApiClient } = await import('../src/api/client.js');
    const api = createApiClient({
      baseUrl: 'http://x.test',
      fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch,
    });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '0' });
    await Promise.all([createServer({ api }).connect(st), client.connect(ct)]);
    const res = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(isErr(res)).toBe(true);
    expect(textOf(res)).toContain('not reachable');
    expect(textOf(res)).toContain('start the server');
  });
});

describe('handlers never throw', () => {
  it('an unexpected non-API exception becomes a short isError with a next step', async () => {
    const api = {
      get: async () => { throw new Error('boom internal /secret/path'); },
      post: async () => { throw new Error('boom'); },
    };
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '0' });
    await Promise.all([createServer({ api }).connect(st), client.connect(ct)]);
    for (const [name, args] of [
      ['list_agents', {}],
      ['get_findings', { repo: 'a/b', pr: 1 }],
      ['get_conventions', { repo: 'a/b' }],
      ['run_agent_on_pr', { repo: 'a/b', pr: 1 }],
      ['get_blast_radius', { repo: 'a/b', pr: 1 }],
    ] as const) {
      const res = await client.callTool({ name, arguments: args });
      expect(isErr(res), name).toBe(true);
      expect(textOf(res), name).not.toContain('/secret/path');
      expect(textOf(res), name).toMatch(NEXT_STEP);
    }
  });
});
