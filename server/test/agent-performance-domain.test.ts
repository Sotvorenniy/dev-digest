/**
 * SPEC-04 agent-performance domain: the pure aggregation behind GET /agents/performance and
 * GET /agents/:id/stats. No mocks; the estimator is a fixed function.
 */
import { describe, it, expect } from 'vitest';
import { AgentPerf } from '@devdigest/shared';
import {
  buildAgentPerformance,
  buildAgentStats,
  previousPeriod,
  type PerfAgent,
  type PerfRun,
  type PerfRunFindings,
  type Period,
} from '../src/modules/agent-performance/domain.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const estimate = (m: string, i: number, o: number) => (m === 'priced' ? (i + o) / 1e6 : null);

const FROM = Date.parse('2026-10-10T00:00:00.000Z');
const day: Period = { from: new Date(FROM), to: new Date(FROM + DAY) };

const agent = (id: string, name = id): PerfAgent => ({ id, name, provider: 'openai', model: 'priced' });

let seq = 0;
const run = (over: Partial<PerfRun> & { at?: number } = {}): PerfRun => {
  const { at, ...rest } = over;
  return {
    id: `r${seq++}`,
    agentId: 'a1',
    ranAt: new Date(at ?? FROM + HOUR),
    model: 'priced',
    durationMs: 1000,
    tokensIn: 10_000,
    tokensOut: 10_000,
    costUsd: null,
    status: 'done',
    ...rest,
  };
};
const fnd = (runId: string, accepted: number, dismissed: number, pending = 0, severity = 'WARNING'): PerfRunFindings => ({
  runId,
  severity,
  total: accepted + dismissed + pending,
  accepted,
  dismissed,
});

const perf = (
  runs: PerfRun[],
  findings: PerfRunFindings[] = [],
  agents: PerfAgent[] = [agent('a1')],
  period: Period = day,
) => buildAgentPerformance({ period, agents, runs, findings, hasAnyRuns: true, estimate });

describe('agent-performance domain', () => {
  it('AC6/EC11: the window is half-open [from, to); the run before from belongs to the previous period', () => {
    const runs = [
      run({ at: FROM - 1 }),
      run({ at: FROM }),
      run({ at: FROM + DAY - 1 }),
      run({ at: FROM + DAY }),
    ];
    const out = perf(runs);
    expect(out.summary.runs).toBe(2);
    expect(out.agents[0]!.runs).toBe(2);
    // the from-1ms run is in the previous window: it shows up in previous_decided / previous cost only
    expect(out.summary.previous_total_cost_usd).toBeCloseTo(0.02, 9);
    expect(out.summary.total_cost_usd).toBeCloseTo(0.04, 9);
  });

  it('AC7/EC4: accept rate is accepted / decided with pending excluded; no decisions gives null, not 0', () => {
    const r = run();
    const out = perf([r], [fnd(r.id, 3, 1, 2)]);
    const row = out.agents[0]!;
    expect(row.decided).toBe(4);
    expect(row.accept_rate).toBe(0.75);
    expect(row.pending).toBe(2);
    expect(row.dismiss_rate).toBe(0.25);

    const r2 = run();
    const none = perf([r2], [fnd(r2.id, 0, 0, 3)]);
    expect(none.agents[0]!.accept_rate).toBeNull();
    expect(none.summary.avg_accept_rate).toBeNull();
  });

  it('AC8: the summary accept rate is pooled (sum accepted / sum decided), not a mean of rates', () => {
    const a = run({ agentId: 'a1' });
    const b = run({ agentId: 'a2' });
    const f = [fnd(a.id, 9, 1), fnd(b.id, 1, 9)];
    expect(perf([a, b], f, [agent('a1'), agent('a2')]).summary.avg_accept_rate).toBe(0.5);

    const c = run({ agentId: 'a3' });
    const out = perf([a, b, c], [...f, fnd(c.id, 1, 0)], [agent('a1'), agent('a2'), agent('a3')]);
    expect(out.summary.avg_accept_rate).toBeCloseTo(11 / 21, 12);
    expect(out.summary.accepted).toBe(11);
    expect(out.summary.decided).toBe(21);
  });

  it('AC10/EC7: cost is the sum of priced runs; unpriced runs are counted, never summed as 0', () => {
    const out = perf([
      run({ costUsd: 0.02 }),
      run({ costUsd: 0.03 }),
      run({ model: 'unknown-slug', costUsd: null }),
    ]);
    expect(out.summary.total_cost_usd).toBeCloseTo(0.05, 9);
    expect(out.summary.unpriced_runs).toBe(1);
    expect(out.agents[0]!.avg_cost_usd).toBeCloseTo(0.025, 9);
  });

  it('AC10: all runs unpriced gives a null total; a zero-token run with no persisted cost is unpriced', () => {
    const out = perf([run({ model: 'unknown-slug' }), run({ tokensIn: 0, tokensOut: 0 })]);
    expect(out.summary.total_cost_usd).toBeNull();
    expect(out.summary.unpriced_runs).toBe(2);
    expect(out.agents[0]!.avg_cost_usd).toBeNull();
    expect(out.cost_by_agent).toEqual([]);
    expect(out.cost_by_model).toEqual([]);
  });

  it('AC11/EC8/EC9: both breakdowns sum to the total, sorted descending, with deleted-agent and unknown-model kinds', () => {
    const out = perf(
      [
        run({ agentId: 'a1', model: 'priced', costUsd: 0.01 }),
        run({ agentId: 'a2', model: 'priced', costUsd: 0.06 }),
        run({ agentId: null, model: null, costUsd: 0.03 }),
        run({ agentId: 'gone-agent', model: 'other', costUsd: 0.02 }),
      ],
      [],
      [agent('a1', 'Alpha'), agent('a2', 'Beta')],
    );
    const total = out.summary.total_cost_usd!;
    expect(total).toBeCloseTo(0.12, 9);
    for (const seg of [out.cost_by_agent, out.cost_by_model]) {
      expect(Math.abs(seg.reduce((s, x) => s + x.value, 0) - total)).toBeLessThanOrEqual(1e-9);
      expect(seg.map((x) => x.value)).toEqual([...seg.map((x) => x.value)].sort((a, b) => b - a));
    }
    expect(out.cost_by_agent.map((s) => [s.kind, s.label])).toEqual([
      ['agent', 'Beta'],
      ['deleted_agent', null],
      ['agent', 'Alpha'],
    ]);
    expect(out.cost_by_agent[1]!.value).toBeCloseTo(0.05, 9);
    expect(out.cost_by_model.find((s) => s.kind === 'unknown_model')).toEqual({
      label: null,
      value: 0.03,
      kind: 'unknown_model',
    });
  });

  it('EC8: runs of several deleted agents merge into ONE deleted row (no duplicate row key)', () => {
    const out = perf(
      [run({ agentId: null }), run({ agentId: 'gone-1' }), run({ agentId: 'gone-2' })],
      [],
      [agent('a1')],
    );
    const deleted = out.agents.filter((r) => r.agent_id == null);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]!.runs).toBe(3);
    expect(deleted[0]!.agent_name).toBeNull();
    expect(out.cost_by_agent.filter((s) => s.kind === 'deleted_agent').length).toBeLessThanOrEqual(1);
  });

  it('AC12/EC10: most active = most runs, then newest last run, then name; the deleted bucket is never chosen', () => {
    const mk = (id: string, n: number, lastAt: number) =>
      Array.from({ length: n }, (_, i) => run({ agentId: id, at: i === 0 ? lastAt : FROM + 1 }));
    const agents = [agent('a1', 'Alpha'), agent('a2', 'Beta'), agent('a3', 'Gamma')];
    const out = perf(
      [...mk('a1', 5, FROM + 5 * HOUR), ...mk('a2', 7, FROM + 2 * HOUR), ...mk('a3', 7, FROM + 9 * HOUR)],
      [],
      agents,
    );
    expect(out.summary.most_active).toMatchObject({ agent_id: 'a3', runs: 7 });
    expect(out.summary.most_active_agent).toBe('Gamma');

    // equal runs and equal last run -> earlier name
    const tie = perf([...mk('a2', 2, FROM + HOUR), ...mk('a1', 2, FROM + HOUR)], [], agents);
    expect(tie.summary.most_active_agent).toBe('Alpha');

    // the deleted bucket has more runs but is never most active
    const del = perf([run({ agentId: null }), run({ agentId: null }), run({ agentId: null }), run({ agentId: 'a1' })], [], agents);
    expect(del.summary.most_active_agent).toBe('Alpha');
    expect(del.agents[0]!.agent_id).toBeNull(); // still listed first by runs

    const empty = perf([], [], agents);
    expect(empty.summary.most_active).toBeNull();
    expect(empty.summary.most_active_agent).toBeNull();
  });

  it('AC18: an agent with no runs keeps a row with runs 0 and null rates, after rows with runs', () => {
    const r = run({ agentId: 'a2' });
    const out = perf([r], [fnd(r.id, 1, 0)], [agent('a1', 'Alpha'), agent('a2', 'Beta')]);
    expect(out.agents.map((x) => x.agent_id)).toEqual(['a2', 'a1']);
    expect(out.agents[1]).toMatchObject({
      runs: 0,
      accept_rate: null,
      avg_cost_usd: null,
      total_cost_usd: null,
      avg_latency_ms: null,
      last_run_at: null,
      cost_by_model: [],
    });
  });

  it('AC22: previous-period figures come from the equal-length window just before from', () => {
    const prev = previousPeriod(day);
    expect(prev.from.getTime()).toBe(FROM - DAY);
    expect(prev.to.getTime()).toBe(FROM);

    const p1 = run({ at: FROM - HOUR, costUsd: 0.1 });
    const c1 = run({ at: FROM + HOUR, costUsd: 0.2 });
    const out = perf([p1, c1], [fnd(p1.id, 1, 1), fnd(c1.id, 3, 1)]);
    expect(out.summary.previous_total_cost_usd).toBeCloseTo(0.1, 9);
    expect(out.summary.total_cost_usd).toBeCloseTo(0.2, 9);
    expect(out.agents[0]).toMatchObject({ previous_decided: 2, previous_accept_rate: 0.5, decided: 4, accept_rate: 0.75 });
    expect(out.period).toEqual({
      from: day.from.toISOString(),
      to: day.to.toISOString(),
      previous_from: new Date(FROM - DAY).toISOString(),
      previous_to: day.from.toISOString(),
    });
    expect(perf([]).summary.previous_total_cost_usd).toBeNull();
  });

  it('EC20/EC21: runs_series is hourly up to 48 h, daily above, aligned to from, and sums to the run count', () => {
    const runs = [run({ at: FROM }), run({ at: FROM + 5 * HOUR + 1 }), run({ at: FROM + DAY - 1 })];
    const hourly = perf(runs).summary.runs_series;
    expect(hourly).toHaveLength(24);
    expect(hourly[0]).toEqual({ label: new Date(FROM).toISOString(), value: 1 });
    expect(hourly[5]!.value).toBe(1);
    expect(hourly[23]!.value).toBe(1);
    expect(hourly.reduce((s, x) => s + x.value, 0)).toBe(3);

    const two: Period = { from: day.from, to: new Date(FROM + 48 * HOUR) };
    expect(perf([], [], [agent('a1')], two).summary.runs_series).toHaveLength(48);

    const thirty: Period = { from: day.from, to: new Date(FROM + 30 * DAY) };
    const daily = perf([run({ at: FROM + 3 * DAY + HOUR })], [], [agent('a1')], thirty).summary.runs_series;
    expect(daily).toHaveLength(30);
    expect(daily[3]!.value).toBe(1);
    expect(daily[1]!.label).toBe(new Date(FROM + DAY).toISOString());

    const odd: Period = { from: day.from, to: new Date(FROM + 49 * HOUR) };
    const oddSeries = perf([run({ at: FROM + 48 * HOUR + 1 })], [], [agent('a1')], odd).summary.runs_series;
    expect(oddSeries).toHaveLength(3);
    expect(oddSeries[2]!.value).toBe(1);
  });

  it('EC6: a failed run counts in runs and cost but not in the average latency', () => {
    const out = perf([
      run({ status: 'done', durationMs: 1000, costUsd: 0.01 }),
      run({ status: 'failed', durationMs: 9000, costUsd: 0.01 }),
    ]);
    const row = out.agents[0]!;
    expect(row.runs).toBe(2);
    expect(row.total_cost_usd).toBeCloseTo(0.02, 9);
    expect(row.avg_latency_ms).toBe(1000);
  });

  it('EC17: two runs of one agent on the same PR both count with their own findings', () => {
    const a = run();
    const b = run();
    const out = perf([a, b], [fnd(a.id, 1, 0), fnd(b.id, 0, 1)]);
    expect(out.agents[0]).toMatchObject({ runs: 2, findings_total: 2, accepted: 1, dismissed: 1 });
  });

  it('findings of a run outside the current window are not counted', () => {
    const old = run({ at: FROM - HOUR });
    const out = perf([old], [fnd(old.id, 5, 5)]);
    expect(out.agents[0]).toMatchObject({ runs: 0, decided: 0, previous_decided: 10 });
  });

  it('AC9: buildAgentStats equals the same agent row of buildAgentPerformance', () => {
    const a = run({ costUsd: 0.02, durationMs: 500 });
    const b = run({ model: 'unknown-slug', durationMs: 1500 });
    const c = run({ status: 'failed', costUsd: 0.01 });
    const other = run({ agentId: 'a2' });
    const findings = [fnd(a.id, 2, 1, 1, 'CRITICAL'), fnd(b.id, 1, 0, 0, 'SUGGESTION'), fnd(other.id, 4, 0)];
    const agents = [agent('a1'), agent('a2')];
    const all = buildAgentPerformance({ period: day, agents, runs: [a, b, c, other], findings, hasAnyRuns: true, estimate });
    const row = all.agents.find((r) => r.agent_id === 'a1')!;
    const stats = buildAgentStats({
      period: day,
      agent: agents[0]!,
      runs: [a, b, c],
      findings: findings.filter((f) => f.runId !== other.id),
      estimate,
    });
    for (const k of [
      'runs',
      'findings_total',
      'accepted',
      'dismissed',
      'pending',
      'accept_rate',
      'dismiss_rate',
      'avg_findings_per_run',
      'total_cost_usd',
      'avg_cost_usd',
      'avg_latency_ms',
      'last_run_at',
      'unpriced_runs',
      'decided',
      'findings_by_severity',
    ] as const) {
      expect(stats[k], k).toEqual(row[k]);
    }
    expect(stats.trend.map((p) => p.value)).toEqual(row.trend);
    expect(stats.findings_by_severity.CRITICAL).toBe(4);
  });

  it('trend keeps the findings count of the last 10 runs, oldest first', () => {
    const runs = Array.from({ length: 12 }, (_, i) => run({ at: FROM + i * 1000 }));
    const findings = runs.map((r, i) => fnd(r.id, i, 0));
    const row = perf(runs, findings).agents[0]!;
    expect(row.trend).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('NFR4: the output has exactly the contract keys and carries no finding text, file, prompt or diff', () => {
    const a = run({ costUsd: 0.01 });
    const out = perf([a, run({ agentId: null, model: null })], [fnd(a.id, 1, 1, 1)]);
    expect(AgentPerf.parse(out)).toEqual(out); // zod strips unknown keys: equal means none were added
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
    };
    walk(out);
    for (const bad of ['title', 'rationale', 'suggestion', 'file', 'prompt', 'diff']) expect(keys.has(bad), bad).toBe(false);
  });
});
