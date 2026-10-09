import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createApiClient } from '../../src/api/client.js';
import { createServer } from '../../src/server.js';

export const BASE = 'http://api.test';
export const REPO_ID = '11111111-1111-4111-8111-111111111111';
export const PR_ID = '22222222-2222-4222-8222-222222222222';
export const RUN_A = '33333333-3333-4333-8333-333333333333';
export const RUN_B = '44444444-4444-4444-8444-444444444444';
export const RUN_OTHER = '55555555-5555-4555-8555-555555555555';
export const AGENT_ID = '66666666-6666-4666-8666-666666666666';

export interface Req {
  method: string;
  path: string;
  body: unknown;
}

export type RouteValue =
  | { status?: number; body?: unknown; raw?: string }
  | ((req: Req, n: number) => { status?: number; body?: unknown; raw?: string });

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Fake fetch routed by "METHOD /path". Unrouted requests answer 404 and are recorded. */
export function fakeFetch(routes: Record<string, RouteValue>) {
  const calls: Req[] = [];
  const counts = new Map<string, number>();
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const req: Req = { method, path: u.pathname, body };
    calls.push(req);
    const key = `${method} ${u.pathname}`;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    const route = routes[key];
    if (!route) return jsonResponse(404, { error: { code: 'not_found', message: 'no route' } });
    const v = typeof route === 'function' ? route(req, n) : route;
    if (v.raw !== undefined) return new Response(v.raw, { status: v.status ?? 200 });
    return jsonResponse(v.status ?? 200, v.body ?? {});
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export function fakeClock() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

export const textOf = (result: unknown): string => {
  const c = (result as { content: { type: string; text: string }[] }).content;
  return c[0]?.text ?? '';
};
export const isErr = (result: unknown): boolean =>
  (result as { isError?: boolean }).isError === true;
export const jsonOf = (result: unknown): Record<string, any> => JSON.parse(textOf(result));

/** Real MCP server + client over InMemoryTransport, backed by a fake fetch. */
export async function connect(routes: Record<string, RouteValue>) {
  const { fetch, calls } = fakeFetch(routes);
  const api = createApiClient({ baseUrl: BASE, fetch });
  const clock = fakeClock();
  const server = createServer({ api, sleep: clock.sleep, now: clock.now });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(st), client.connect(ct)]);
  return {
    client,
    calls,
    clock,
    call: (name: string, args: Record<string, unknown>) =>
      client.callTool({ name, arguments: args }),
    close: () => client.close(),
  };
}

export const repoRoutes = (): Record<string, RouteValue> => ({
  'GET /repos': { body: [{ id: REPO_ID, full_name: 'Acme/Api' }] },
  [`GET /repos/${REPO_ID}/pulls`]: { body: [{ id: PR_ID, number: 7, title: 't', status: 'open' }] },
});

export const finding = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  severity: 'WARNING',
  category: 'bug',
  title: 'title',
  file: 'a.ts',
  start_line: 1,
  end_line: 2,
  rationale: 'why',
  suggestion: 'fix it',
  confidence: 0.9,
  dismissed_at: null,
  ...over,
});

export const review = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  run_id: RUN_A,
  agent_id: AGENT_ID,
  agent_name: 'Security',
  verdict: 'comment',
  score: 80,
  summary: 'sum',
  created_at: '2026-01-01T00:00:00Z',
  findings: [finding()],
  ...over,
});
