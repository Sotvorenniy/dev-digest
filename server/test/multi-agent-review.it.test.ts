import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'ok',
  score: 90,
  findings: [],
};

type Db = PgFixture['handle']['db'];

let seq = 0;
async function setupPr(db: Db, workspaceId: string) {
  const name = `multi-${seq++}-${randomUUID().slice(0, 6)}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'PR',
      author: 'a',
      branch: 'feat',
      base: 'main',
      headSha: 'abc',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return pr!;
}

d('multi-agent review (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function makeAgent(name: string, enabled = true): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    if (!enabled) {
      const upd = await app.inject({ method: 'PUT', url: `/agents/${id}`, payload: { enabled: false } });
      expect(upd.statusCode).toBe(200);
    }
    return id;
  }

  const runCount = async (prId: string) =>
    (await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId))).length;

  it('AC1: POST agent_ids runs the subset in request order and creates one run per agent', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId);
    const a = await makeAgent('A1');
    const b = await makeAgent('B1');
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agent_ids: [b, a] },
    });
    expect(res.statusCode).toBe(200);
    // fails if targets were resolved in listing order instead of request order
    expect(res.json().runs.map((r: { agent_id: string }) => r.agent_id)).toEqual([b, a]);
    const rows = await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    expect(rows).toHaveLength(2);
  });

  it('AC2: invalid agent_ids combinations answer 400 invalid_run_request and create no runs', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId);
    const a = await makeAgent('A2');
    const seven = Array.from({ length: 7 }, () => randomUUID());
    const payloads = [
      { agent_ids: [] },
      { agent_ids: [a, a] },
      { agent_ids: seven },
      { agent_ids: [a], all: true },
      { agent_ids: [a], agentId: a },
    ];
    for (const payload of payloads) {
      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error.code).toBe('invalid_run_request');
    }
    expect(await runCount(pr.id)).toBe(0);
  });

  it('AC3: a disabled agent, an unknown uuid and a non-uuid answer 404 and create no runs', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId);
    const live = await makeAgent('A3');
    const disabled = await makeAgent('Off3', false);
    for (const ids of [[live, disabled], [randomUUID()], ['not-a-uuid']]) {
      const res = await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agent_ids: ids },
      });
      expect(res.statusCode, JSON.stringify(ids)).toBe(404);
    }
    // fails if the live agent of a mixed list were started before the bad one is rejected
    expect(await runCount(pr.id)).toBe(0);
  });

  describe('GET with seeded rows (AC9, AC12, AC15, AC17)', () => {
    let pr: Awaited<ReturnType<typeof setupPr>>;
    let A: string, B: string, C: string, D: string;
    let findingA: string, findingB: string;
    let runA: string, runC: string;

    beforeAll(async () => {
      const db = pg.handle.db;
      pr = await setupPr(db, workspaceId);
      A = await makeAgent('Seed A');
      B = await makeAgent('Seed B');
      C = await makeAgent('Seed C');
      D = await makeAgent('Seed D');

      const mkRun = async (agentId: string, status: string, error: string | null) => {
        const [r] = await db
          .insert(t.agentRuns)
          .values({
            workspaceId,
            agentId,
            prId: pr.id,
            status,
            error,
            provider: 'openai',
            model: 'gpt-4.1',
            durationMs: 1000,
            costUsd: 0.01,
            score: status === 'done' ? 80 : null,
          })
          .returning();
        return r!.id;
      };
      const mkReview = async (agentId: string, runId: string, at: Date) => {
        const [r] = await db
          .insert(t.reviews)
          .values({
            workspaceId,
            prId: pr.id,
            agentId,
            runId,
            kind: 'review',
            verdict: 'comment',
            summary: `sum-${agentId}`,
            model: 'gpt-4.1',
            createdAt: at,
          })
          .returning();
        return r!.id;
      };
      const mkFinding = async (reviewId: string, severity: string, s: number, e: number) => {
        const [f] = await db
          .insert(t.findings)
          .values({
            reviewId,
            file: 'src/config.ts',
            startLine: s,
            endLine: e,
            severity,
            category: 'bug',
            title: `${severity} ${s}-${e}`,
            rationale: 'r',
            confidence: 0.9,
          })
          .returning();
        return f!.id;
      };

      runA = await mkRun(A, 'done', null);
      const reviewA = await mkReview(A, runA, new Date(Date.now() - 2000));
      findingA = await mkFinding(reviewA, 'CRITICAL', 1, 3);

      const runB = await mkRun(B, 'done', null);
      const reviewB = await mkReview(B, runB, new Date(Date.now() - 1000));
      findingB = await mkFinding(reviewB, 'WARNING', 3, 5); // touches A's [1,3]

      runC = await mkRun(C, 'failed', 'provider exploded');
      // D: no run at all
    });

    it('AC9/AC12/AC15: returns one column per requested agent in order, with statuses, error and conflicts', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/pulls/${pr.id}/multi-agent?agents=${[A, B, C, D].join(',')}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.pr_id).toBe(pr.id);
      expect(body.columns.map((c: { agent_id: string }) => c.agent_id)).toEqual([A, B, C, D]);
      expect(body.columns.map((c: { status: string }) => c.status)).toEqual(['done', 'done', 'failed', 'none']);
      expect(body.columns[0].run_id).toBe(runA);
      expect(body.columns[2]).toMatchObject({ run_id: runC, error: 'provider exploded', findings: [] });
      expect(body.columns[3]).toMatchObject({ run_id: null, error: null, findings: [] });

      // fails if the overlap group were not computed server-side across agents
      expect(body.conflicts).toHaveLength(1);
      const conflict = body.conflicts[0];
      expect(conflict.is_conflict).toBe(true); // CRITICAL vs WARNING
      expect(conflict.line).toBe(1);
      expect(conflict.end_line).toBe(5);
      expect(conflict.takes.map((tk: { agent_id: string }) => tk.agent_id)).toEqual([A, B]);
      expect(conflict.takes.map((tk: { verdict: string }) => tk.verdict)).toEqual(['CRITICAL', 'WARNING']);
    });

    it('NFR1: the multi-agent GET responds in under 500 ms', async () => {
      const t0 = performance.now();
      const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent?agents=${A},${B}` });
      const elapsed = performance.now() - t0;
      expect(res.statusCode).toBe(200);
      expect(elapsed).toBeLessThan(500);
    });

    it('answers 400 for an empty agents list, 404 for an unknown agent or PR', async () => {
      const empty = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent?agents=` });
      expect(empty.statusCode).toBe(400);
      expect(empty.json().error.code).toBe('invalid_run_request');
      const unknownAgent = await app.inject({
        method: 'GET',
        url: `/pulls/${pr.id}/multi-agent?agents=${randomUUID()}`,
      });
      expect(unknownAgent.statusCode).toBe(404);
      const unknownPr = await app.inject({
        method: 'GET',
        url: `/pulls/${randomUUID()}/multi-agent?agents=${A}`,
      });
      expect(unknownPr.statusCode).toBe(404);
    });

    it('AC17: GET /pulls/:id/reviews attributes findings and A.agreed_by names B (never A itself)', async () => {
      const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` });
      expect(res.statusCode).toBe(200);
      const findings = (res.json() as { findings: Record<string, unknown>[] }[]).flatMap((r) => r.findings) as {
        id: string;
        agent_id: string;
        agent_name: string;
        group_key: string | null;
        agreed_by: { agent_id: string; finding_id: string }[];
      }[];
      const fa = findings.find((f) => f.id === findingA)!;
      const fb = findings.find((f) => f.id === findingB)!;
      expect(fa.agent_id).toBe(A);
      expect(fa.agent_name).toBe('Seed A');
      expect(fa.group_key).not.toBeNull();
      expect(fa.group_key).toBe(fb.group_key);
      expect(fa.agreed_by).toEqual([{ agent_id: B, agent_name: 'Seed B', finding_id: findingB }]);
      expect(fb.agreed_by).toEqual([{ agent_id: A, agent_name: 'Seed A', finding_id: findingA }]);
    });
  });
});
