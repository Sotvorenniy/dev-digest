/**
 * SPEC-07 eval dashboard against real Postgres: the two read routes, the window query that bounds
 * the per-agent read, workspace scoping, deletion and the NFR1 timing. Gated on Docker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeStubRepoIntel } from './helpers/repo-intel-stub.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import * as t from '../src/db/schema.js';
import { EvalAgentDashboard, EvalWorkspaceDashboard } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 1);
const NO_DOCS = {
  roots: [],
  scan: async () => ({ kind: 'clone_unavailable' as const }),
  read: async () => ({ kind: 'missing' as const }),
  exists: async () => 'missing' as const,
};

type RunStatus = 'running' | 'done' | 'partial' | 'failed';

d('eval dashboard (Testcontainers pg)', () => {
  let pg: PgFixture;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const db = () => pg.handle.db;

  /** A fresh workspace, so tests never see each other's rows. */
  async function makeWorkspace() {
    const [ws] = await db().insert(t.workspaces).values({ name: `ws-${seq++}` }).returning();
    return ws!;
  }

  async function makeApp(ws: { id: string; name: string }) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: db(),
      overrides: {
        auth: new MockAuthProvider(undefined, { id: ws.id, name: ws.name }),
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        repoIntel: makeStubRepoIntel([]),
        projectDocs: NO_DOCS as never,
      },
    });
  }

  async function makeAgent(workspaceId: string, name: string) {
    const [a] = await db()
      .insert(t.agents)
      .values({ workspaceId, name, provider: 'openrouter', model: 'm/x', systemPrompt: 'p', enabled: true, version: 1 })
      .returning();
    return a!;
  }

  async function addCases(workspaceId: string, agentId: string, n: number) {
    await db()
      .insert(t.evalCases)
      .values(
        Array.from({ length: n }, (_, i) => ({
          workspaceId,
          ownerKind: 'agent' as const,
          ownerId: agentId,
          name: `case-${seq++}-${i}`,
          inputDiff: '@@ -1 +1 @@\n+a',
          inputFiles: ['a.ts'],
          inputMeta: { pr_number: 1, title: 't', body: null },
          expectedOutput: { type: 'must_find', items: [] },
        })),
      );
  }

  interface RunSeed {
    agentId: string;
    /** minutes after T0 at which the run finished (started one minute earlier) */
    at: number;
    status?: RunStatus;
    recall?: number | null;
    precision?: number | null;
    citation?: number | null;
    passed?: number;
    total?: number;
    version?: number;
  }

  async function addRuns(workspaceId: string, runs: RunSeed[]) {
    const rows = runs.map((r) => {
      const status = r.status ?? 'done';
      return {
        workspaceId,
        agentId: r.agentId,
        agentVersion: r.version ?? 1,
        provider: 'openrouter',
        model: 'm/x',
        strategy: 'single-pass',
        systemPrompt: 'SECRET-PROMPT',
        status,
        startedAt: new Date(T0 + (r.at - 1) * MIN),
        finishedAt: status === 'running' ? null : new Date(T0 + r.at * MIN),
        casesTotal: r.total ?? 4,
        casesPassed: r.passed ?? 3,
        casesErrored: 0,
        recall: r.recall === undefined ? 0.5 : r.recall,
        precision: r.precision === undefined ? 0.6 : r.precision,
        citationAccuracy: r.citation === undefined ? 0.7 : r.citation,
        costUsd: 0.01,
        durationMs: 1000,
        caseSet: [],
        results: [],
      };
    });
    for (let i = 0; i < rows.length; i += 500) await db().insert(t.evalSetRuns).values(rows.slice(i, i + 500));
  }

  const getDash = async (app: Awaited<ReturnType<typeof makeApp>>) => {
    const res = await app.inject({ method: 'GET', url: '/eval/dashboard' });
    expect(res.statusCode, res.body).toBe(200);
    return EvalWorkspaceDashboard.parse(res.json());
  };

  it('AC2: lists only agents with cases, each row equal to its latest stored run', async () => {
    const ws = await makeWorkspace();
    const app = await makeApp(ws);
    const withCases = await makeAgent(ws.id, 'Has Cases');
    const noCases = await makeAgent(ws.id, 'No Cases');
    await addCases(ws.id, withCases.id, 3);
    await addRuns(ws.id, [
      { agentId: withCases.id, at: 1, recall: 0.1 },
      { agentId: withCases.id, at: 2, recall: 0.9, precision: 0.8, citation: 0.75, passed: 2, total: 3, version: 4 },
      { agentId: noCases.id, at: 3 },
    ]);

    const dash = await getDash(app);
    expect(dash.agents.map((a) => a.agent_id)).toEqual([withCases.id]);
    const row = dash.agents[0]!;
    expect(row).toMatchObject({ name: 'Has Cases', model: 'm/x', cases_total: 3 });
    expect(row.latest).toMatchObject({
      agent_version: 4,
      recall: 0.9,
      precision: 0.8,
      citation_accuracy: 0.75,
      cases_passed: 2,
      cases_total: 3,
      status: 'done',
    });
    expect(JSON.stringify(dash)).not.toContain('SECRET-PROMPT');
  });

  it('EC3/EC5: latest skips failed and running; an agent with only failed runs has latest null', async () => {
    const ws = await makeWorkspace();
    const app = await makeApp(ws);
    const good = await makeAgent(ws.id, 'Good');
    const bad = await makeAgent(ws.id, 'Bad');
    await addCases(ws.id, good.id, 1);
    await addCases(ws.id, bad.id, 1);
    await addRuns(ws.id, [
      { agentId: good.id, at: 1, recall: 0.4 },
      { agentId: good.id, at: 2, status: 'partial', recall: 0.6 },
      { agentId: good.id, at: 3, status: 'failed', recall: null, precision: null, citation: null },
      { agentId: good.id, at: 4, status: 'running', recall: null, precision: null, citation: null },
      { agentId: bad.id, at: 5, status: 'failed', recall: null, precision: null, citation: null },
    ]);

    const dash = await getDash(app);
    const g = dash.agents.find((a) => a.agent_id === good.id)!;
    const b = dash.agents.find((a) => a.agent_id === bad.id)!;
    expect(g.latest!.status).toBe('partial');
    expect(g.latest!.recall).toBe(0.6);
    expect(g.recall_series).toEqual([0.4, 0.6]);
    expect(b.latest).toBeNull();
    expect(b.recall_series).toEqual([]);
  });

  it('window query: bounds the per-agent read to 10 finished runs and returns latest/previous/recall_series', async () => {
    const ws = await makeWorkspace();
    const app = await makeApp(ws);
    const a1 = await makeAgent(ws.id, 'Many Runs');
    const a2 = await makeAgent(ws.id, 'Other Many');
    await addCases(ws.id, a1.id, 1);
    await addCases(ws.id, a2.id, 1);
    // 25 finished runs per agent (recall = n/100, a null-recall partial in the window) + noise
    const seed: RunSeed[] = [];
    for (let n = 1; n <= 25; n++) {
      seed.push({ agentId: a1.id, at: n * 2, recall: n / 100 });
      seed.push({ agentId: a2.id, at: n * 2 + 1, recall: 0.5 });
    }
    seed.push({ agentId: a1.id, at: 49, status: 'partial', recall: null }); // inside a1's newest 10
    seed.push({ agentId: a1.id, at: 100, status: 'failed', recall: null, precision: null, citation: null });
    seed.push({ agentId: a1.id, at: 101, status: 'running', recall: null, precision: null, citation: null });
    await addRuns(ws.id, seed);

    // The repository read itself is bounded: 2 agents x 10, not 2 x 26+ rows.
    const repo = new EvalRepository(db());
    const rows = await repo.listFinishedRunsPerAgent(ws.id, [a1.id, a2.id], 10);
    expect(rows).toHaveLength(20);
    expect(rows.filter((r) => r.agentId === a1.id)).toHaveLength(10);
    expect(rows.filter((r) => r.agentId === a2.id)).toHaveLength(10);
    expect(rows.every((r) => r.status === 'done' || r.status === 'partial')).toBe(true);
    const times = rows.map((r) => r.finishedAt!.getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x));
    expect(rows.every((r) => r.systemPrompt === '' && r.results.length === 0)).toBe(true);
    expect(await repo.listFinishedRunsPerAgent(ws.id, [], 10)).toEqual([]);

    // a1's newest 10 finished: n = 25..17 (9 runs, finish minute 2n) + the minute-49 partial with null recall (dropped)
    const dash = await getDash(app);
    const row = dash.agents.find((a) => a.agent_id === a1.id)!;
    expect(row.latest!.recall).toBe(0.25);
    expect(row.recall_series).toEqual([0.17, 0.18, 0.19, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25]);
    expect(row.recall_series.length).toBeLessThanOrEqual(10);
    const other = dash.agents.find((a) => a.agent_id === a2.id)!;
    expect(other.recall_series).toEqual(Array(10).fill(0.5));
  });

  it('AC5: recent_runs has 10 items, newest first, running runs included (sorted by start)', async () => {
    const ws = await makeWorkspace();
    const app = await makeApp(ws);
    const ag = await makeAgent(ws.id, 'Recent');
    await addCases(ws.id, ag.id, 1);
    const seed: RunSeed[] = Array.from({ length: 14 }, (_, i) => ({ agentId: ag.id, at: i + 1 }));
    seed.push({ agentId: ag.id, at: 50, status: 'running', recall: null, precision: null, citation: null });
    await addRuns(ws.id, seed);

    const dash = await getDash(app);
    expect(dash.recent_runs).toHaveLength(10);
    expect(dash.recent_runs[0]).toMatchObject({ status: 'running', agent_name: 'Recent' });
    const starts = dash.recent_runs.map((r) => Date.parse(r.finished_at ?? r.started_at));
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
    expect(dash.recent_runs[1]!.finished_at).toBe(new Date(T0 + 14 * MIN).toISOString());
  });

  it('scopes to the caller workspace: another workspace agent and runs never appear', async () => {
    const ws = await makeWorkspace();
    const other = await makeWorkspace();
    const app = await makeApp(ws);
    const mine = await makeAgent(ws.id, 'Mine');
    const theirs = await makeAgent(other.id, 'Theirs');
    await addCases(ws.id, mine.id, 1);
    await addCases(other.id, theirs.id, 1);
    await addRuns(ws.id, [{ agentId: mine.id, at: 1 }]);
    await addRuns(other.id, [{ agentId: theirs.id, at: 2 }]);

    const dash = await getDash(app);
    expect(dash.agents.map((a) => a.name)).toEqual(['Mine']);
    expect(dash.recent_runs.map((r) => r.agent_name)).toEqual(['Mine']);
  });

  it('AC13: GET /agents/:id/eval-dashboard returns cards data; an unknown agent is 404 not_found', async () => {
    const ws = await makeWorkspace();
    const app = await makeApp(ws);
    const ag = await makeAgent(ws.id, 'Detail');
    await addCases(ws.id, ag.id, 2);
    await addRuns(ws.id, [
      { agentId: ag.id, at: 1, recall: 0.2 },
      { agentId: ag.id, at: 2, recall: 0.4 },
      { agentId: ag.id, at: 3, status: 'failed', recall: null, precision: null, citation: null },
      { agentId: ag.id, at: 5, status: 'running', recall: null, precision: null, citation: null },
    ]);

    const res = await app.inject({ method: 'GET', url: `/agents/${ag.id}/eval-dashboard` });
    expect(res.statusCode, res.body).toBe(200);
    const body = EvalAgentDashboard.parse(res.json());
    expect(body).toMatchObject({ agent_id: ag.id, name: 'Detail', model: 'm/x', cases_total: 2 });
    expect(body.latest!.recall).toBe(0.4);
    expect(body.previous!.recall).toBe(0.2);
    expect(body.trend.map((p) => p.recall)).toEqual([0.2, 0.4]);
    expect(body.runs.map((r) => r.status)).toEqual(['running', 'failed', 'done', 'done']);

    const missing = await app.inject({
      method: 'GET',
      url: '/agents/00000000-0000-4000-8000-000000000000/eval-dashboard',
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toContain('not_found');

    const otherWs = await makeWorkspace();
    const foreign = await makeApp(otherWs);
    expect((await foreign.inject({ method: 'GET', url: `/agents/${ag.id}/eval-dashboard` })).statusCode).toBe(404);
  });

  it('latest/previous/trend survive 25 newer failed runs and a running one (older finished runs not hidden)', async () => {
    const ws = await makeWorkspace();
    const app = await makeApp(ws);
    const ag = await makeAgent(ws.id, 'Failing Lately');
    await addRuns(ws.id, [
      { agentId: ag.id, at: 1, recall: 0.3 },
      { agentId: ag.id, at: 2, recall: 0.6 },
      ...Array.from({ length: 25 }, (_, i) => ({
        agentId: ag.id,
        at: 10 + i,
        status: 'failed' as const,
        recall: null,
        precision: null,
        citation: null,
      })),
      { agentId: ag.id, at: 99, status: 'running', recall: null, precision: null, citation: null },
    ]);
    const body = EvalAgentDashboard.parse(
      (await app.inject({ method: 'GET', url: `/agents/${ag.id}/eval-dashboard` })).json(),
    );
    expect(body.latest!.recall).toBe(0.6);
    expect(body.previous!.recall).toBe(0.3);
    expect(body.trend.map((p) => p.recall)).toEqual([0.3, 0.6]);
    expect(body.runs).toHaveLength(20);
    expect(body.runs.every((r) => r.status !== 'done')).toBe(true);

    // workspace dashboard too: the window is over finished runs only
    const dash = await getDash(app);
    expect(dash.agents.find((a) => a.agent_id === ag.id) ?? null).toBeNull(); // no cases -> not listed
  });

  it('per-agent run table is capped at 20 while the trend keeps every finished run', async () => {
    const ws = await makeWorkspace();
    const app = await makeApp(ws);
    const ag = await makeAgent(ws.id, 'Long');
    await addRuns(
      ws.id,
      Array.from({ length: 30 }, (_, i) => ({ agentId: ag.id, at: i + 1, recall: (i + 1) / 100 })),
    );
    const res = await app.inject({ method: 'GET', url: `/agents/${ag.id}/eval-dashboard` });
    const body = EvalAgentDashboard.parse(res.json());
    expect(body.cases_total).toBe(0);
    expect(body.runs).toHaveLength(20);
    expect(body.trend).toHaveLength(30);
    expect(body.trend[0]!.recall).toBe(0.01);
    expect(body.runs[0]!.recall).toBe(0.3);
  });

  it('EC8: deleting the agent removes it from the dashboard and drops its cases and runs', async () => {
    const ws = await makeWorkspace();
    const app = await makeApp(ws);
    const ag = await makeAgent(ws.id, 'Doomed');
    await addCases(ws.id, ag.id, 1);
    await addRuns(ws.id, [{ agentId: ag.id, at: 1 }]);
    expect((await getDash(app)).agents).toHaveLength(1);

    const del = await app.inject({ method: 'DELETE', url: `/agents/${ag.id}` });
    expect(del.statusCode, del.body).toBeLessThan(300);

    const dash = await getDash(app);
    expect(dash.agents).toEqual([]);
    expect(dash.recent_runs).toEqual([]);
    expect(await db().select().from(t.evalSetRuns).where(eq(t.evalSetRuns.agentId, ag.id))).toHaveLength(0);
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.ownerId, ag.id))).toHaveLength(0);
  });

  it('NFR1: p95 of 20 GET /eval/dashboard over 10 agents / 200 runs is <= 1000 ms', async () => {
    const ws = await makeWorkspace();
    const app = await makeApp(ws);
    const seed: RunSeed[] = [];
    for (let i = 0; i < 10; i++) {
      const ag = await makeAgent(ws.id, `perf-${i}`);
      await addCases(ws.id, ag.id, 5);
      for (let n = 1; n <= 20; n++) seed.push({ agentId: ag.id, at: n * 10 + i, recall: n / 100 });
    }
    await addRuns(ws.id, seed);

    await app.inject({ method: 'GET', url: '/eval/dashboard' }); // warm-up
    const times: number[] = [];
    let dash: EvalWorkspaceDashboard | undefined;
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      const res = await app.inject({ method: 'GET', url: '/eval/dashboard' });
      times.push(performance.now() - s);
      expect(res.statusCode).toBe(200);
      dash = EvalWorkspaceDashboard.parse(res.json());
    }
    expect(dash!.agents).toHaveLength(10);
    expect(dash!.agents.every((a) => a.recall_series.length === 10)).toBe(true);
    times.sort((a, b) => a - b);
    expect(times[Math.ceil(times.length * 0.95) - 1]!).toBeLessThanOrEqual(1000);
  }, 120_000);
});
