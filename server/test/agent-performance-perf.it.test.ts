/**
 * SPEC-04 NFR1: GET /agents/performance over a bulk-seeded workspace (20 agents, 10,000 runs,
 * 10,000 reviews, 50,000 findings) answers within p95 <= 1,000 ms. Gated on Docker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeStubRepoIntel } from './helpers/repo-intel-stub.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { AgentPerf } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DAY = 86_400_000;
const TO = Date.parse('2026-09-30T00:00:00.000Z');
const FROM = TO - 30 * DAY;
const RUNS = 10_000;
const CHUNK = 2_000;

async function chunked<T>(rows: T[], insert: (c: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

d('agent performance NFR1 (Testcontainers pg)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('p95 of 20 sequential GETs over 10k runs / 50k findings is <= 1000 ms', async () => {
    const db = pg.handle.db;
    const [ws] = await db.insert(t.workspaces).values({ name: 'perf' }).returning();
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'perf', fullName: 'acme/perf' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({ workspaceId: ws!.id, repoId: repo!.id, number: 1, title: 'p', author: 'a', branch: 'b', base: 'main', headSha: 's' })
      .returning();
    const agents = await db
      .insert(t.agents)
      .values(
        Array.from({ length: 20 }, (_, i) => ({
          workspaceId: ws!.id,
          name: `agent-${i}`,
          provider: 'openai' as const,
          model: 'gpt-x',
          systemPrompt: 'p',
        })),
      )
      .returning();

    const runIds: string[] = [];
    const runRows = Array.from({ length: RUNS }, (_, i) => ({
      workspaceId: ws!.id,
      agentId: agents[i % 20]!.id,
      prId: pr!.id,
      ranAt: new Date(FROM + Math.floor(((i + 0.5) / RUNS) * 30 * DAY)),
      status: 'done',
      model: 'gpt-x',
      costUsd: 0.01,
      durationMs: 1000,
    }));
    for (let i = 0; i < runRows.length; i += CHUNK) {
      const out = await db.insert(t.agentRuns).values(runRows.slice(i, i + CHUNK)).returning({ id: t.agentRuns.id });
      runIds.push(...out.map((r) => r.id));
    }

    const reviewIds: string[] = [];
    for (let i = 0; i < runIds.length; i += CHUNK) {
      const out = await db
        .insert(t.reviews)
        .values(
          runIds.slice(i, i + CHUNK).map((runId, j) => ({
            workspaceId: ws!.id,
            prId: pr!.id,
            agentId: agents[(i + j) % 20]!.id,
            runId,
            kind: 'review' as const,
          })),
        )
        .returning({ id: t.reviews.id });
      reviewIds.push(...out.map((r) => r.id));
    }

    const findingRows = reviewIds.flatMap((reviewId, i) =>
      Array.from({ length: 5 }, (_, k) => ({
        reviewId,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: ['CRITICAL', 'WARNING', 'SUGGESTION'][(i + k) % 3]!,
        category: 'bug',
        title: 't',
        rationale: 'r',
        confidence: 0.5,
        acceptedAt: k === 0 ? new Date(TO) : null,
        dismissedAt: k === 1 ? new Date(TO) : null,
      })),
    );
    expect(findingRows).toHaveLength(50_000);
    // 11 columns per row; keep each statement below the Postgres 65,535 bind-parameter limit
    await chunked(findingRows, (c) => db.insert(t.findings).values(c));

    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: ws!.id, name: ws!.name }),
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        repoIntel: makeStubRepoIntel([]),
      },
    });
    const url = `/agents/performance?from=${encodeURIComponent(new Date(FROM).toISOString())}&to=${encodeURIComponent(new Date(TO).toISOString())}`;

    await app.inject({ method: 'GET', url }); // warm-up
    const times: number[] = [];
    let body: AgentPerf | undefined;
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      const res = await app.inject({ method: 'GET', url });
      times.push(performance.now() - s);
      expect(res.statusCode).toBe(200);
      body = AgentPerf.parse(res.json());
    }
    expect(body!.summary.runs).toBe(RUNS);
    times.sort((a, b) => a - b);
    expect(times[Math.ceil(times.length * 0.95) - 1]!).toBeLessThanOrEqual(1000);
  }, 180_000);
});
