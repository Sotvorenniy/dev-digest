/**
 * SPEC-02 onboarding routes against a real Postgres (Testcontainers): AC3 join, AC10 409,
 * 404/422, NFR2 429 on the 11th request, NFR8/EC13 corrupt stored row, EC17 cascade.
 * Gated on Docker like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { OnboardingState, OnboardingGenerateResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeStubRepoIntel } from './helpers/repo-intel-stub.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/index.js';
import type { LLMProvider } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const testConfig = () => loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

const OUTPUT = {
  architecture: { summary: 'S', nodes: [], edges: [] },
  critical_paths: [],
  run_locally: [],
  reading_path: [{ path: 'src/a.ts', reason: 'entry' }],
  first_tasks: [],
};

/** A provider whose structured call is held until `release()`. */
function gatedProvider() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const calls: unknown[] = [];
  const provider = {
    id: 'openrouter',
    completeStructured: async (req: unknown) => {
      calls.push(req);
      await gate;
      return { data: OUTPUT, model: 'm', tokensIn: 1, tokensOut: 1, costUsd: null, raw: '', attempts: 1 };
    },
  } as unknown as LLMProvider;
  return { provider, calls, release };
}

function indexedIntel(): RepoIntel {
  return {
    ...makeStubRepoIntel([]),
    hasIndexState: async () => true,
    getIndexState: async (repoId: string) => ({
      repoId,
      status: 'full' as const,
      filesIndexed: 2,
      filesSkipped: 0,
      durationMs: 1,
      lastIndexedSha: 'sha-1',
      indexerVersion: 1,
      updatedAt: new Date(0),
    }),
    getRankedFiles: async () => [
      { path: 'src/a.ts', pagerank: 0.6, hotness: 0, junk: false },
      { path: 'src/b.ts', pagerank: 0.4, hotness: 0, junk: false },
    ],
    getCriticalPaths: async () => [['src/a.ts', 'src/b.ts']],
  };
}

const rootFiles = { read: async () => null };

d('onboarding routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let n = 0;
  const apps: FastifyInstance[] = [];

  async function makeRepo(clonePath: string | null): Promise<string> {
    n += 1;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `onb-${n}`,
        fullName: `acme/onb-${n}`,
        defaultBranch: 'main',
        clonePath,
      })
      .returning({ id: t.repos.id });
    return r!.id;
  }

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    for (const a of apps) await a.close();
    await pg?.stop();
  });

  async function app(llm?: LLMProvider, repoIntel: RepoIntel = indexedIntel()) {
    const a = await buildApp({
      config: testConfig(),
      db: pg.handle.db,
      overrides: { repoIntel, rootFiles, ...(llm ? { llm: { openrouter: llm } } : {}) },
    });
    apps.push(a);
    return a;
  }

  it('AC3: two POSTs 100 ms apart return 202 with the same job_id; the provider is called once', async () => {
    const repoId = await makeRepo('/clones/x');
    const g = gatedProvider();
    const a = await app(g.provider);

    const first = await a.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    await new Promise((r) => setTimeout(r, 100));
    const second = await a.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    const b1 = OnboardingGenerateResponse.parse(first.json());
    const b2 = OnboardingGenerateResponse.parse(second.json());
    expect(b2.job_id).toBe(b1.job_id);

    const mid = OnboardingState.parse((await a.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).json());
    expect(mid.status).toBe('generating');
    expect(mid.job_id).toBe(b1.job_id);

    g.release();
    await a.container.jobs.onIdle();
    expect(g.calls).toHaveLength(1);

    const done = OnboardingState.parse((await a.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).json());
    expect(done.status).toBe('ready');
    expect(done.tour?.outcome).toBe('ai');
    expect(done.tour?.llm_calls).toBe(1);
    expect(done.tour?.indexed_sha).toBe('sha-1');
  });

  it('AC10: no clone -> 409 repo_not_indexed and no onboarding job row', async () => {
    const repoId = await makeRepo(null);
    const a = await app(gatedProvider().provider);
    const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_indexed');
    const jobs = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.kind, 'onboarding-generate'));
    expect(jobs.filter((j) => (j.payload as { repoId?: string })?.repoId === repoId)).toHaveLength(0);
  });

  it('AC10: a clone but no index state row -> 409', async () => {
    const repoId = await makeRepo('/clones/y');
    const a = await app(gatedProvider().provider, { ...indexedIntel(), hasIndexState: async () => false });
    const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_indexed');
  });

  it('GET for an unindexed repo reports index.usable false and status none', async () => {
    const repoId = await makeRepo(null);
    const a = await app();
    const st = OnboardingState.parse((await a.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).json());
    expect(st.status).toBe('none');
    expect(st.index.usable).toBe(false);
    expect(st.tour).toBeNull();
  });

  it('unknown repo: GET and POST return 404', async () => {
    const a = await app();
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await a.inject({ method: 'GET', url: `/repos/${id}/onboarding` })).statusCode).toBe(404);
    expect((await a.inject({ method: 'POST', url: `/repos/${id}/onboarding/generate` })).statusCode).toBe(404);
  });

  it('a non-uuid id returns 422 validation_error', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/repos/not-a-uuid/onboarding' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });

  it('NFR8/EC13: a stored row with an old shape gives 200 status none, tour null', async () => {
    const repoId = await makeRepo('/clones/z');
    await pg.handle.db.insert(t.onboarding).values({
      repoId,
      json: { sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }] },
    });
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    const st = OnboardingState.parse(res.json());
    expect(st.status).toBe('none');
    expect(st.tour).toBeNull();
    expect(st.is_stale).toBe(false);
  });

  it('EC17: deleting the repo removes its stored tour', async () => {
    const repoId = await makeRepo('/clones/w');
    await pg.handle.db.insert(t.onboarding).values({ repoId, json: { any: 'thing' } });
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repoId));
    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(0);
  });
});

d('onboarding generate rate limit (own app, rate limiter enabled)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let repoId: string;
  const g = gatedProvider();

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'rl', fullName: 'acme/rl', defaultBranch: 'main', clonePath: '/clones/rl' })
      .returning({ id: t.repos.id });
    repoId = r!.id;
    // The global/per-route limiter is not registered under NODE_ENV=test.
    app = await buildApp({
      config: loadConfig({
        ...process.env,
        NODE_ENV: 'development',
        API_HOST: '127.0.0.1',
        LOG_LEVEL: 'silent',
      } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { repoIntel: indexedIntel(), rootFiles, llm: { openrouter: g.provider } },
    });
  });
  afterAll(async () => {
    g.release();
    await app?.container.jobs.onIdle();
    await app?.close();
    await pg?.stop();
  });

  it('NFR2: 10 POSTs return 202 and the 11th within the minute returns 429', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
      expect(res.statusCode).toBe(202);
    }
    const eleventh = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(eleventh.statusCode).toBe(429);
  });
});
