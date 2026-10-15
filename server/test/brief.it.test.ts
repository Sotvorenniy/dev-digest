/**
 * SPEC-03 PR brief routes against real Postgres: GET never generates, POST generates once and
 * stores, failure leaves the stored row untouched, workspace scoping, cascade, the token-path
 * head SHA (F1), the empty-body POST parser (F7c) and the generate rate limit (NFR3).
 * Gated on Docker like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeStubRepoIntel } from './helpers/repo-intel-stub.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { PrBrief } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (env: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv);

const PATCH = '@@ -8,3 +8,4 @@\n a\n b\n+c\n d';
const NO_DOCS = {
  roots: [],
  scan: async () => ({ kind: 'clone_unavailable' as const }),
  read: async () => ({ kind: 'missing' as const }),
  exists: async () => 'missing' as const,
};

/** A fake provider: counts calls, can be switched to fail, focuses on a configurable file. */
function fakeLlm(file = 'src/a.ts', line = 10) {
  const state = { calls: 0, fail: false };
  const provider = {
    id: 'openrouter',
    completeStructured: async () => {
      state.calls++;
      if (state.fail) throw new Error('502 bad gateway');
      return {
        data: {
          summary: 'A summary',
          risks: [{ kind: 'k', title: 'Risk', explanation: 'e', severity: 'low', file_refs: [`${file}:${line}`] }],
          review_focus: [{ file, line, reason: 'look here' }],
        },
        raw: '',
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.001,
        model: 'm',
      };
    },
  } as unknown as LLMProvider;
  return { state, provider };
}

d('brief routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makePr(opts: { ws?: string; headSha?: string; files?: boolean } = {}) {
    const db = pg.handle.db;
    const name = `brief-${seq++}`;
    const ws = opts.ws ?? workspaceId;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 7,
        title: 'Add limiter',
        author: 'a',
        branch: 'feat/x',
        base: 'main',
        headSha: opts.headSha ?? 'sha-1',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
        body: 'No issue here',
      })
      .returning();
    if (opts.files !== false) {
      await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', additions: 1, deletions: 0, patch: PATCH });
    }
    return pr!;
  }

  const app = async (llm = fakeLlm(), extra: Record<string, unknown> = {}, env: Record<string, string> = {}) => ({
    llm,
    app: await buildApp({
      config: config(env),
      db: pg.handle.db,
      overrides: {
        llm: { openrouter: llm.provider, openai: llm.provider, anthropic: llm.provider },
        github: new MockGitHubClient(),
        repoIntel: makeStubRepoIntel([]),
        projectDocs: NO_DOCS as never,
        ...extra,
      },
    }),
  });
  const rowText = async (prId: string) =>
    (await pg.handle.db.execute(sql`select json::text as j from pr_brief where pr_id = ${prId}`))[0]?.j as
      | string
      | undefined;

  it('AC1: GET 404s with no stored brief and never calls the model', async () => {
    const { app: a, llm } = await app();
    const pr = await makePr();
    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(404);
    expect(llm.state.calls).toBe(0);
  });

  it('AC9/AC6: two POSTs leave one row whose head_sha matches the PR', async () => {
    const { app: a } = await app();
    const pr = await makePr({ headSha: 'sha-xyz' });
    const r1 = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const r2 = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(rows).toHaveLength(1);
    expect(PrBrief.parse(rows[0]!.json).head_sha).toBe('sha-xyz');
    expect(PrBrief.parse(r2.json()).review_focus).toEqual([{ file: 'src/a.ts', line: 10, reason: 'look here' }]);
  });

  it('NFR1/NFR7: 20 GETs make 0 model calls and stay under p95 300 ms', async () => {
    const { app: a, llm } = await app();
    const pr = await makePr();
    await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const before = llm.state.calls;
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
      times.push(performance.now() - s);
      expect(res.statusCode).toBe(200);
    }
    expect(llm.state.calls).toBe(before);
    times.sort((x, y) => x - y);
    expect(times[Math.floor(times.length * 0.95) - 1]!).toBeLessThanOrEqual(300);
  });

  it('AC13: a failed regeneration answers 502 and leaves the stored row byte-identical', async () => {
    const { app: a, llm } = await app();
    const pr = await makePr();
    await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const before = await rowText(pr.id);
    expect(before).toBeTruthy();
    llm.state.fail = true;
    const res = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(502);
    expect(await rowText(pr.id)).toBe(before);
  });

  it('AC13: no provider key answers 500 config_error and stores nothing', async () => {
    const a = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider({}),
        github: new MockGitHubClient(),
        repoIntel: makeStubRepoIntel([]),
        projectDocs: NO_DOCS as never,
      },
    });
    const pr = await makePr();
    const res = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(500);
    expect(res.body).toContain('config_error');
    expect(await rowText(pr.id)).toBeUndefined();
  });

  it('AC16: a PR with no files answers 422 with zero model calls', async () => {
    const { app: a, llm } = await app();
    const pr = await makePr({ files: false });
    const res = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(422);
    expect(llm.state.calls).toBe(0);
  });

  it('EC15: a stored row that no longer parses is a 404, not a 500', async () => {
    const { app: a } = await app();
    const pr = await makePr();
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { risks: 'nope' } });
    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(404);
  });

  it('deleting the PR cascades to its brief row', async () => {
    const { app: a } = await app();
    const pr = await makePr();
    await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(await rowText(pr.id)).toBeTruthy();
    await pg.handle.db.delete(t.pullRequests).where(eq(t.pullRequests.id, pr.id));
    expect(await rowText(pr.id)).toBeUndefined();
  });

  it('a PR in another workspace is a 404 for GET and POST, and no model call is made', async () => {
    const { app: a, llm } = await app();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'Other' }).returning();
    const pr = await makePr({ ws: other!.id });
    expect((await a.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).statusCode).toBe(404);
    expect((await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode).toBe(404);
    expect(llm.state.calls).toBe(0);
  });

  it('a non-uuid id is a 422', async () => {
    const { app: a } = await app();
    expect((await a.inject({ method: 'GET', url: '/pulls/not-a-uuid/brief' })).statusCode).toBe(422);
    expect((await a.inject({ method: 'POST', url: '/pulls/not-a-uuid/brief' })).statusCode).toBe(422);
  });

  it('F1: the token path stores the live head SHA, so the brief is not falsely stale', async () => {
    const gh = new MockGitHubClient({ detail: { head_sha: 'live-sha-2' } });
    const { app: a } = await app(fakeLlm('src/config.ts', 11), { github: gh });
    const pr = await makePr({ headSha: 'old-sha' });
    const detail = await a.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().head_sha).toBe('live-sha-2');
    const [row] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr.id));
    expect(row!.headSha).toBe('live-sha-2');
    const res = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().head_sha).toBe('live-sha-2');
  });

  it('F7c: POST with a JSON content-type and no body is accepted; {} too; broken JSON is a 400', async () => {
    const { app: a } = await app();
    const pr = await makePr();
    const url = `/pulls/${pr.id}/brief`;
    const json = { 'content-type': 'application/json' };
    expect((await a.inject({ method: 'POST', url, headers: json, payload: '' })).statusCode).toBe(200);
    expect((await a.inject({ method: 'POST', url, headers: json, payload: '{}' })).statusCode).toBe(200);
    expect((await a.inject({ method: 'POST', url, headers: json, payload: '{bad' })).statusCode).toBe(400);
  });

  it('NFR3: the 11th POST in a minute is a 429 while GET is not limited at 10', async () => {
    const { app: a } = await app(fakeLlm(), {}, { NODE_ENV: 'development', API_HOST: '127.0.0.1' });
    const pr = await makePr();
    const url = `/pulls/${pr.id}/brief`;
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await a.inject({ method: 'POST', url })).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    for (let i = 0; i < 12; i++) {
      expect((await a.inject({ method: 'GET', url })).statusCode).toBe(200);
    }
  });
});
