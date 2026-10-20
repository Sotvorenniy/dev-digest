/**
 * SPEC-04 agent performance routes against real Postgres: period validation (422), route precedence
 * of GET /agents/performance over /agents/:id, window and status filters, the shared reducer
 * (stats == dashboard row), empty states, read-only behaviour and workspace scoping.
 * Gated on Docker like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeStubRepoIntel } from './helpers/repo-intel-stub.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { AgentPerf, AgentStats } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.parse('2026-09-01T00:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const q = (from: number, to: number) => `from=${encodeURIComponent(iso(from))}&to=${encodeURIComponent(iso(to))}`;
const DAY_Q = q(T0, T0 + DAY);

const NO_DOCS = {
  roots: [],
  scan: async () => ({ kind: 'clone_unavailable' as const }),
  read: async () => ({ kind: 'missing' as const }),
  exists: async () => 'missing' as const,
};

/** An LLM fake that records any call; the dashboard must never reach it. */
function countingLlm() {
  const state = { calls: 0 };
  const provider = new Proxy(
    {},
    {
      get: () => async () => {
        state.calls++;
        throw new Error('LLM must not be called by the dashboard');
      },
    },
  ) as unknown as LLMProvider;
  return { state, provider };
}

d('agent performance routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** A fresh workspace, one repo + PR, and an app whose auth resolves to that workspace. */
  async function world() {
    const db = pg.handle.db;
    const n = seq++;
    const [ws] = await db.insert(t.workspaces).values({ name: `perf-${n}` }).returning();
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: `perf-${n}`, fullName: `acme/perf-${n}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id,
        repoId: repo!.id,
        number: 1,
        title: 'PR',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 's',
      })
      .returning();
    const llm = countingLlm();
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: ws!.id, name: ws!.name }),
        secrets: new MockSecretsProvider(),
        llm: { openai: llm.provider, anthropic: llm.provider, openrouter: llm.provider },
        github: new MockGitHubClient(),
        repoIntel: makeStubRepoIntel([]),
        projectDocs: NO_DOCS as never,
      },
    });

    const agent = async (name: string) => {
      const [a] = await db
        .insert(t.agents)
        .values({ workspaceId: ws!.id, name, provider: 'openai', model: 'gpt-x', systemPrompt: 'p' })
        .returning();
      return a!;
    };
    interface RunOpts {
      at: number;
      status?: string;
      costUsd?: number | null;
      model?: string | null;
      durationMs?: number | null;
      tokensIn?: number | null;
      tokensOut?: number | null;
    }
    const run = async (agentId: string | null, o: RunOpts) => {
      const [r] = await db
        .insert(t.agentRuns)
        .values({
          workspaceId: ws!.id,
          agentId,
          prId: pr!.id,
          ranAt: new Date(o.at),
          status: o.status ?? 'done',
          costUsd: o.costUsd === undefined ? 0.01 : o.costUsd,
          model: o.model === undefined ? 'gpt-x' : o.model,
          durationMs: o.durationMs === undefined ? 1000 : o.durationMs,
          tokensIn: o.tokensIn ?? null,
          tokensOut: o.tokensOut ?? null,
        })
        .returning();
      return r!;
    };
    /** A review linked to the run, with findings: [severity, 'accepted'|'dismissed'|'pending']. */
    const review = async (runId: string, agentId: string | null, fs: Array<[string, 'accepted' | 'dismissed' | 'pending']>) => {
      const [rv] = await db
        .insert(t.reviews)
        .values({ workspaceId: ws!.id, prId: pr!.id, agentId, runId, kind: 'review' })
        .returning();
      for (const [severity, state] of fs) {
        await db.insert(t.findings).values({
          reviewId: rv!.id,
          file: 'a.ts',
          startLine: 1,
          endLine: 1,
          severity,
          category: 'bug',
          title: 'SECRET TITLE',
          rationale: 'SECRET RATIONALE',
          confidence: 0.9,
          acceptedAt: state === 'accepted' ? new Date() : null,
          dismissedAt: state === 'dismissed' ? new Date() : null,
        });
      }
    };
    const get = (url: string) => app.inject({ method: 'GET', url });
    const perf = async (query: string) => {
      const res = await get(`/agents/performance?${query}`);
      expect(res.statusCode, res.body).toBe(200);
      return AgentPerf.parse(res.json());
    };
    const counts = async () => ({
      runs: (await db.select().from(t.agentRuns)).length,
      reviews: (await db.select().from(t.reviews)).length,
      findings: (await db.select().from(t.findings)).length,
    });
    return { db, ws: ws!, pr: pr!, app, llm, agent, run, review, get, perf, counts };
  }

  it('AC5: both endpoints answer 422 validation_error for a bad or missing period, 200 at exactly 366 days', async () => {
    const w = await world();
    const a = await w.agent('A');
    const iso0 = encodeURIComponent(iso(T0));
    const iso1 = encodeURIComponent(iso(T0 + DAY));
    const bad: Record<string, string> = {
      'missing from': `to=${iso1}`,
      'missing to': `from=${iso0}`,
      'from=yesterday': `from=yesterday&to=${iso1}`,
      'date without time': `from=2026-01-01&to=${iso1}`,
      'from after to': `from=${iso1}&to=${iso0}`,
      'from equals to': `from=${iso0}&to=${iso0}`,
      '366 days + 1 ms': q(T0, T0 + 366 * DAY + 1),
    };
    for (const [name, qs] of Object.entries(bad)) {
      for (const url of [`/agents/performance?${qs}`, `/agents/${a.id}/stats?${qs}`]) {
        const res = await w.get(url);
        expect(res.statusCode, `${name} ${url}`).toBe(422);
        expect(res.json().error.code, name).toBe('validation_error');
        expect(res.json().summary, name).toBeUndefined();
      }
    }
    const edge = q(T0, T0 + 366 * DAY);
    expect((await w.get(`/agents/performance?${edge}`)).statusCode).toBe(200);
    expect((await w.get(`/agents/${a.id}/stats?${edge}`)).statusCode).toBe(200);
  });

  it('routing: /agents/performance is not matched as /agents/:id; stats 404 and 422 behave', async () => {
    const w = await world();
    const res = await w.get(`/agents/performance?${DAY_Q}`);
    expect(res.statusCode).toBe(200);
    expect(AgentPerf.safeParse(res.json()).success).toBe(true);

    // without a query it is still the performance route (validation on from/to), never "id must be a uuid"
    const noQuery = await w.get('/agents/performance');
    expect(noQuery.statusCode).toBe(422);
    const paths = (noQuery.json().error.details as Array<{ instancePath?: string; params?: { issue?: { path?: unknown[] } } }>)
      .map((x) => JSON.stringify(x));
    expect(paths.join('|')).toMatch(/from|to/);
    expect(paths.join('|')).not.toMatch(/"id"/);

    const unknown = await w.get(`/agents/00000000-0000-4000-8000-000000000000/stats?${DAY_Q}`);
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('not_found');

    expect((await w.get(`/agents/not-a-uuid/stats?${DAY_Q}`)).statusCode).toBe(422);
  });

  it('AC6/EC5: boundary runs count half-open and a running run is ignored', async () => {
    const w = await world();
    const a = await w.agent('A');
    await w.run(a.id, { at: T0 - 1 });
    await w.run(a.id, { at: T0 });
    await w.run(a.id, { at: T0 + DAY - 1 });
    await w.run(a.id, { at: T0 + DAY });
    await w.run(a.id, { at: T0 + HOUR, status: 'running' });
    const out = await w.perf(DAY_Q);
    expect(out.summary.runs).toBe(2);
    expect(out.agents.find((r) => r.agent_id === a.id)!.runs).toBe(2);
    expect(out.summary.runs_series.reduce((s, p) => s + p.value, 0)).toBe(2);
  });

  it('AC7/AC8/AC10/AC11/AC12 end to end: rates, pooled rate, cost sums, breakdowns, most active', async () => {
    const w = await world();
    const a = await w.agent('Alpha');
    const b = await w.agent('Beta');
    const r1 = await w.run(a.id, { at: T0 + HOUR, costUsd: 0.02, model: 'm1' });
    const r2 = await w.run(a.id, { at: T0 + 2 * HOUR, costUsd: 0.03, model: 'm2' });
    const r3 = await w.run(a.id, { at: T0 + 3 * HOUR, costUsd: null, model: 'unpriced-slug' });
    const r4 = await w.run(b.id, { at: T0 + 4 * HOUR, costUsd: 0.07, model: 'm1' });
    await w.review(r1.id, a.id, [['CRITICAL', 'accepted'], ['WARNING', 'accepted'], ['WARNING', 'accepted'], ['SUGGESTION', 'dismissed'], ['SUGGESTION', 'pending'], ['SUGGESTION', 'pending']]);
    await w.review(r2.id, a.id, []);
    await w.review(r4.id, b.id, [['WARNING', 'accepted'], ['WARNING', 'dismissed']]);
    void r3;

    const out = await w.perf(DAY_Q);
    const alpha = out.agents.find((r) => r.agent_id === a.id)!;
    expect(alpha).toMatchObject({ runs: 3, findings_total: 6, accepted: 3, dismissed: 1, pending: 2, decided: 4, accept_rate: 0.75, unpriced_runs: 1 });
    expect(alpha.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 3 });
    expect(alpha.total_cost_usd).toBeCloseTo(0.05, 9);
    expect(out.summary).toMatchObject({ runs: 4, accepted: 4, decided: 6, unpriced_runs: 1, most_active_agent: 'Alpha', has_any_runs: true });
    expect(out.summary.avg_accept_rate).toBeCloseTo(4 / 6, 12);
    expect(out.summary.total_cost_usd).toBeCloseTo(0.12, 9);
    for (const seg of [out.cost_by_agent, out.cost_by_model]) {
      expect(Math.abs(seg.reduce((s, x) => s + x.value, 0) - 0.12)).toBeLessThanOrEqual(1e-9);
    }
    expect(out.cost_by_agent.map((s) => s.label)).toEqual(['Beta', 'Alpha']);
    expect(out.cost_by_model.map((s) => s.label).sort()).toEqual(['m1', 'm2']);
  });

  it('AC9: /agents/:id/stats equals the dashboard row for 1-day, 30-day and custom periods', async () => {
    const w = await world();
    const a = await w.agent('A');
    const b = await w.agent('B');
    for (let i = 0; i < 12; i++) {
      const r = await w.run(i % 3 === 0 ? b.id : a.id, {
        at: T0 - 20 * DAY + i * 41 * HOUR,
        costUsd: i % 4 === 0 ? null : 0.01 * (i + 1),
        status: i % 5 === 0 ? 'failed' : 'done',
        durationMs: 500 + i * 100,
      });
      await w.review(r.id, a.id, [['WARNING', i % 2 ? 'accepted' : 'dismissed'], ['CRITICAL', 'pending']]);
    }
    const periods = [q(T0 - DAY, T0), q(T0 - 30 * DAY, T0), q(T0 - 17 * DAY - 3 * HOUR, T0 - 2 * DAY + 5 * HOUR)];
    for (const qs of periods) {
      const out = await w.perf(qs);
      for (const ag of [a, b]) {
        const res = await w.get(`/agents/${ag.id}/stats?${qs}`);
        expect(res.statusCode, res.body).toBe(200);
        const stats = AgentStats.parse(res.json());
        const row = out.agents.find((r) => r.agent_id === ag.id)!;
        for (const k of ['runs', 'findings_total', 'accepted', 'dismissed', 'pending', 'decided', 'accept_rate', 'dismiss_rate', 'avg_findings_per_run', 'total_cost_usd', 'avg_cost_usd', 'avg_latency_ms', 'last_run_at', 'unpriced_runs', 'findings_by_severity'] as const) {
          expect(stats[k], `${qs} ${ag.id} ${k}`).toEqual(row[k]);
        }
        expect(stats.period).toEqual(out.period);
      }
    }
  });

  it('AC17: empty workspace has has_any_runs false; runs only outside the period keep it true with runs 0', async () => {
    const w = await world();
    const empty = await w.perf(DAY_Q);
    expect(empty.summary).toMatchObject({ has_any_runs: false, runs: 0 });
    const a = await w.agent('A');
    await w.run(a.id, { at: T0 - 10 * DAY });
    const outside = await w.perf(DAY_Q);
    expect(outside.summary).toMatchObject({ has_any_runs: true, runs: 0, total_cost_usd: null });
    expect(outside.agents).toHaveLength(1);
    expect(outside.agents[0]).toMatchObject({ runs: 0, accept_rate: null, last_run_at: null });
  });

  it('AC22: previous-period figures come from runs in the equal window before from', async () => {
    const w = await world();
    const a = await w.agent('A');
    const prev = await w.run(a.id, { at: T0 - 2 * HOUR, costUsd: 0.4 });
    const cur = await w.run(a.id, { at: T0 + 2 * HOUR, costUsd: 0.1 });
    await w.review(prev.id, a.id, [['WARNING', 'accepted'], ['WARNING', 'dismissed']]);
    await w.review(cur.id, a.id, [['WARNING', 'accepted']]);
    const out = await w.perf(DAY_Q);
    expect(out.summary.previous_total_cost_usd).toBeCloseTo(0.4, 9);
    expect(out.summary.total_cost_usd).toBeCloseTo(0.1, 9);
    expect(out.agents[0]).toMatchObject({ previous_decided: 2, previous_accept_rate: 0.5, decided: 1, accept_rate: 1 });
    expect(out.period.previous_from).toBe(iso(T0 - DAY));
    expect(out.period.previous_to).toBe(iso(T0));
  });

  it('EC16: a decision made after the run still counts with that run period', async () => {
    const w = await world();
    const a = await w.agent('A');
    const r = await w.run(a.id, { at: T0 + HOUR });
    // review helper stamps accepted_at = now (months after T0): the run's period still owns it
    await w.review(r.id, a.id, [['WARNING', 'accepted']]);
    const out = await w.perf(DAY_Q);
    expect(out.agents[0]).toMatchObject({ accepted: 1, decided: 1, accept_rate: 1 });
  });

  it('a review with no run link is not counted in any metric', async () => {
    const w = await world();
    const a = await w.agent('A');
    await w.run(a.id, { at: T0 + HOUR });
    const [rv] = await w.db.insert(t.reviews).values({ workspaceId: w.ws.id, prId: w.pr.id, agentId: a.id, runId: null, kind: 'review' }).returning();
    await w.db.insert(t.findings).values({ reviewId: rv!.id, file: 'a', startLine: 1, endLine: 1, severity: 'WARNING', category: 'bug', title: 't', rationale: 'r', confidence: 1, acceptedAt: new Date() });
    const out = await w.perf(DAY_Q);
    expect(out.agents[0]).toMatchObject({ findings_total: 0, decided: 0 });
  });

  it('EC8: runs of deleted agents (set null) collapse into ONE deleted row, no duplicate row identity', async () => {
    const w = await world();
    const keep = await w.agent('Keep');
    const g1 = await w.agent('Gone1');
    const g2 = await w.agent('Gone2');
    await w.run(keep.id, { at: T0 + HOUR });
    await w.run(g1.id, { at: T0 + 2 * HOUR, costUsd: 0.02 });
    await w.run(g2.id, { at: T0 + 3 * HOUR, costUsd: 0.03 });
    await w.run(null, { at: T0 + 4 * HOUR, costUsd: 0.04 });
    await w.db.delete(t.agents).where(eq(t.agents.id, g1.id));
    await w.db.delete(t.agents).where(eq(t.agents.id, g2.id));
    const out = await w.perf(DAY_Q);
    const deleted = out.agents.filter((r) => r.agent_id == null);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatchObject({ agent_name: null, runs: 3 });
    expect(out.cost_by_agent.filter((s) => s.kind === 'deleted_agent')).toHaveLength(1);
    expect(out.summary.most_active_agent).toBe('Keep');
    expect(out.summary.total_cost_usd).toBeCloseTo(0.1, 9);
  });

  it('workspace scoping: another workspace runs, agents and findings are not counted', async () => {
    const mine = await world();
    const other = await world();
    const a = await mine.agent('Mine');
    const o = await other.agent('Theirs');
    await mine.run(a.id, { at: T0 + HOUR });
    const r = await other.run(o.id, { at: T0 + HOUR, costUsd: 9 });
    await other.review(r.id, o.id, [['WARNING', 'accepted']]);
    const out = await mine.perf(DAY_Q);
    expect(out.summary.runs).toBe(1);
    expect(out.agents.map((x) => x.agent_name)).toEqual(['Mine']);
    expect(out.summary.total_cost_usd).toBeCloseTo(0.01, 9);
    expect(out.agents[0]!.findings_total).toBe(0);
    // another workspace's agent id is a 404 on the stats route
    expect((await mine.get(`/agents/${o.id}/stats?${DAY_Q}`)).statusCode).toBe(404);
  });

  it('AC20/NFR2/NFR3/NFR4: 10 GETs write nothing, call no LLM, never 429, and leak no finding text', async () => {
    const w = await world();
    const a = await w.agent('A');
    const r = await w.run(a.id, { at: T0 + HOUR });
    await w.review(r.id, a.id, [['WARNING', 'accepted']]);
    const before = await w.counts();
    for (let i = 0; i < 10; i++) {
      const res = await w.get(i % 2 ? `/agents/performance?${DAY_Q}` : `/agents/${a.id}/stats?${DAY_Q}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('SECRET');
    }
    expect(await w.counts()).toEqual(before);
    expect(w.llm.state.calls).toBe(0);
  });
});
