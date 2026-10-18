import type {
  AgentPerf,
  AgentPerfRow,
  AgentStats,
  PerfCostSegment,
  PerfMostActive,
  PerfSeriesPoint,
  StatPoint,
} from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { resolveRunCost, type CostEstimator } from '../../platform/run-cost.js';
import { DAY_MS, HOUR_MS, HOURLY_BUCKET_MAX_MS, TREND_RUNS } from './constants.js';

/** Half-open time window `[from, to)`. */
export interface Period {
  from: Date;
  to: Date;
}

export interface PerfAgent {
  id: string;
  name: string;
  provider: string | null;
  model: string | null;
}

export interface PerfRun {
  id: string;
  agentId: string | null;
  ranAt: Date;
  model: string | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  status: 'done' | 'failed' | 'cancelled';
}

/** Findings of one run, already grouped by severity. */
export interface PerfRunFindings {
  runId: string;
  severity: string;
  total: number;
  accepted: number;
  dismissed: number;
}

export class AggregationFailedError extends AppError {
  constructor() {
    super('internal_error', 'Agent performance aggregation failed', 500);
  }
}

type FindingsByRun = Map<string, PerfRunFindings[]>;

export function previousPeriod(p: Period): Period {
  const len = p.to.getTime() - p.from.getTime();
  return { from: new Date(p.from.getTime() - len), to: new Date(p.from.getTime()) };
}

export function bucketSizeMs(p: Period): number {
  return p.to.getTime() - p.from.getTime() <= HOURLY_BUCKET_MAX_MS ? HOUR_MS : DAY_MS;
}

/** Runs per time bucket, buckets aligned to `from`, oldest first. */
export function runsSeries(p: Period, runs: PerfRun[]): PerfSeriesPoint[] {
  const size = bucketSizeMs(p);
  const fromMs = p.from.getTime();
  const count = Math.max(1, Math.ceil((p.to.getTime() - fromMs) / size));
  const values = new Array<number>(count).fill(0);
  for (const r of runs) {
    const i = Math.floor((r.ranAt.getTime() - fromMs) / size);
    if (i >= 0 && i < count) values[i] = (values[i] ?? 0) + 1;
  }
  return values.map((value, i) => ({ label: new Date(fromMs + i * size).toISOString(), value }));
}

export function indexFindings(findings: PerfRunFindings[]): FindingsByRun {
  const map: FindingsByRun = new Map();
  for (const f of findings) {
    const list = map.get(f.runId);
    if (list) list.push(f);
    else map.set(f.runId, [f]);
  }
  return map;
}

export interface AgentAggregate {
  runs: number;
  findings_total: number;
  accepted: number;
  dismissed: number;
  decided: number;
  pending: number;
  accept_rate: number | null;
  dismiss_rate: number | null;
  avg_findings_per_run: number | null;
  total_cost_usd: number | null;
  unpriced_runs: number;
  avg_cost_usd: number | null;
  avg_latency_ms: number | null;
  last_run_at: string | null;
  findings_by_severity: { CRITICAL: number; WARNING: number; SUGGESTION: number };
  cost_by_model: PerfCostSegment[];
  /** findings per run, last TREND_RUNS runs, oldest first, with the run's time. */
  trend: StatPoint[];
}

/** The single per-agent reducer; both endpoints go through it. */
export function aggregateAgent(
  runs: PerfRun[],
  findingsByRun: FindingsByRun,
  estimate: CostEstimator,
): AgentAggregate {
  const sorted = [...runs].sort((a, b) => a.ranAt.getTime() - b.ranAt.getTime());
  const bySeverity = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  let total = 0;
  let accepted = 0;
  let dismissed = 0;
  let cost: number | null = null;
  let priced = 0;
  let unpriced = 0;
  let latencySum = 0;
  let latencyN = 0;
  const models = new Map<string | null, number>();
  const perRun: StatPoint[] = [];

  for (const run of sorted) {
    let runTotal = 0;
    for (const f of findingsByRun.get(run.id) ?? []) {
      runTotal += f.total;
      accepted += f.accepted;
      dismissed += f.dismissed;
      if (f.severity === 'CRITICAL' || f.severity === 'WARNING' || f.severity === 'SUGGESTION') {
        bySeverity[f.severity] += f.total;
      }
    }
    total += runTotal;
    perRun.push({ label: run.ranAt.toISOString(), value: runTotal });

    const c = resolveRunCost(estimate, run);
    if (c == null) unpriced += 1;
    else {
      priced += 1;
      cost = (cost ?? 0) + c;
      models.set(run.model, (models.get(run.model) ?? 0) + c);
    }
    if (run.status === 'done' && run.durationMs != null) {
      latencySum += run.durationMs;
      latencyN += 1;
    }
  }

  const decided = accepted + dismissed;
  const cost_by_model: PerfCostSegment[] = [...models.entries()]
    .map(([model, value]): PerfCostSegment =>
      model == null
        ? { label: null, value, kind: 'unknown_model' }
        : { label: model, value, kind: 'model' },
    )
    .sort((a, b) => b.value - a.value);

  return {
    runs: sorted.length,
    findings_total: total,
    accepted,
    dismissed,
    decided,
    pending: total - decided,
    accept_rate: decided ? accepted / decided : null,
    dismiss_rate: decided ? dismissed / decided : null,
    avg_findings_per_run: sorted.length ? total / sorted.length : null,
    total_cost_usd: cost,
    unpriced_runs: unpriced,
    avg_cost_usd: priced ? (cost as number) / priced : null,
    avg_latency_ms: latencyN ? latencySum / latencyN : null,
    last_run_at: sorted.length ? sorted[sorted.length - 1]!.ranAt.toISOString() : null,
    findings_by_severity: bySeverity,
    cost_by_model,
    trend: perRun.slice(-TREND_RUNS),
  };
}

function toRow(agent: PerfAgent | null, a: AgentAggregate, prev: AgentAggregate): AgentPerfRow {
  return {
    agent_id: agent?.id ?? null,
    agent_name: agent?.name ?? null,
    provider: agent?.provider ?? null,
    model: agent?.model ?? null,
    runs: a.runs,
    findings_total: a.findings_total,
    accepted: a.accepted,
    dismissed: a.dismissed,
    pending: a.pending,
    decided: a.decided,
    unpriced_runs: a.unpriced_runs,
    previous_decided: prev.decided,
    previous_accept_rate: prev.accept_rate,
    accept_rate: a.accept_rate,
    dismiss_rate: a.dismiss_rate,
    avg_findings_per_run: a.avg_findings_per_run,
    total_cost_usd: a.total_cost_usd,
    avg_cost_usd: a.avg_cost_usd,
    avg_latency_ms: a.avg_latency_ms,
    last_run_at: a.last_run_at,
    findings_by_severity: a.findings_by_severity,
    trend: a.trend.map((p) => p.value),
    cost_by_model: a.cost_by_model,
  };
}

function groupRuns(runs: PerfRun[], known: Set<string>): { byAgent: Map<string, PerfRun[]>; deleted: PerfRun[] } {
  const byAgent = new Map<string, PerfRun[]>();
  const deleted: PerfRun[] = [];
  for (const r of runs) {
    if (r.agentId == null || !known.has(r.agentId)) {
      deleted.push(r);
      continue;
    }
    const list = byAgent.get(r.agentId);
    if (list) list.push(r);
    else byAgent.set(r.agentId, [r]);
  }
  return { byAgent, deleted };
}

function byValueDesc(a: PerfCostSegment, b: PerfCostSegment): number {
  return b.value - a.value;
}

export function buildAgentPerformance(input: {
  period: Period;
  agents: PerfAgent[];
  runs: PerfRun[];
  findings: PerfRunFindings[];
  hasAnyRuns: boolean;
  estimate: CostEstimator;
}): AgentPerf {
  const { period, agents, hasAnyRuns, estimate } = input;
  const previous = previousPeriod(period);
  const fromMs = period.from.getTime();
  const toMs = period.to.getTime();
  const prevFromMs = previous.from.getTime();
  const current = input.runs.filter((r) => r.ranAt.getTime() >= fromMs && r.ranAt.getTime() < toMs);
  const prior = input.runs.filter((r) => r.ranAt.getTime() >= prevFromMs && r.ranAt.getTime() < fromMs);
  const fbr = indexFindings(input.findings);

  const known = new Set(agents.map((a) => a.id));
  const cur = groupRuns(current, known);
  const prv = groupRuns(prior, known);

  interface Entry {
    agent: PerfAgent | null;
    agg: AgentAggregate;
    row: AgentPerfRow;
  }
  const entries: Entry[] = [];
  for (const agent of agents) {
    const agg = aggregateAgent(cur.byAgent.get(agent.id) ?? [], fbr, estimate);
    const prev = aggregateAgent(prv.byAgent.get(agent.id) ?? [], fbr, estimate);
    entries.push({ agent, agg, row: toRow(agent, agg, prev) });
  }
  if (cur.deleted.length > 0) {
    const agg = aggregateAgent(cur.deleted, fbr, estimate);
    const prev = aggregateAgent(prv.deleted, fbr, estimate);
    entries.push({ agent: null, agg, row: toRow(null, agg, prev) });
  }

  // Rows with runs first (runs desc, last run desc, deleted last, name), then rows without runs by name.
  const nameOf = (e: Entry) => e.agent?.name ?? '';
  entries.sort((a, b) => {
    const aHas = a.agg.runs > 0;
    const bHas = b.agg.runs > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas) {
      if (a.agg.runs !== b.agg.runs) return b.agg.runs - a.agg.runs;
      const al = a.agg.last_run_at ?? '';
      const bl = b.agg.last_run_at ?? '';
      if (al !== bl) return al < bl ? 1 : -1;
      if ((a.agent == null) !== (b.agent == null)) return a.agent == null ? 1 : -1;
    }
    return nameOf(a).localeCompare(nameOf(b));
  });

  const all = aggregateAgent(current, fbr, estimate);
  const allPrev = aggregateAgent(prior, fbr, estimate);

  let mostActive: PerfMostActive | null = null;
  const candidates = entries.filter((e) => e.agent != null && e.agg.runs > 0);
  candidates.sort((a, b) => {
    if (a.agg.runs !== b.agg.runs) return b.agg.runs - a.agg.runs;
    const al = a.agg.last_run_at ?? '';
    const bl = b.agg.last_run_at ?? '';
    if (al !== bl) return al < bl ? 1 : -1;
    return nameOf(a).localeCompare(nameOf(b));
  });
  const top = candidates[0];
  if (top?.agent) {
    mostActive = {
      agent_id: top.agent.id,
      agent_name: top.agent.name,
      runs: top.agg.runs,
      accept_rate: top.agg.accept_rate,
      decided: top.agg.decided,
    };
  }

  const cost_by_agent: PerfCostSegment[] =
    all.total_cost_usd == null
      ? []
      : entries
          .filter((e) => e.agg.total_cost_usd != null)
          .map((e): PerfCostSegment =>
            e.agent
              ? { label: e.agent.name, value: e.agg.total_cost_usd as number, kind: 'agent', agent_id: e.agent.id }
              : { label: null, value: e.agg.total_cost_usd as number, kind: 'deleted_agent' },
          )
          .sort(byValueDesc);

  return {
    period: {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      previous_from: previous.from.toISOString(),
      previous_to: previous.to.toISOString(),
    },
    cost_basis: 'estimate',
    summary: {
      has_any_runs: hasAnyRuns,
      runs: current.length,
      total_cost_usd: all.total_cost_usd,
      previous_total_cost_usd: allPrev.total_cost_usd,
      unpriced_runs: all.unpriced_runs,
      avg_accept_rate: all.accept_rate,
      accepted: all.accepted,
      decided: all.decided,
      most_active_agent: mostActive?.agent_name ?? null,
      most_active: mostActive,
      runs_series: runsSeries(period, current),
    },
    agents: entries.map((e) => e.row),
    cost_by_agent,
    cost_by_model: all.total_cost_usd == null ? [] : all.cost_by_model,
  };
}

export function buildAgentStats(input: {
  period: Period;
  agent: PerfAgent;
  runs: PerfRun[];
  findings: PerfRunFindings[];
  estimate: CostEstimator;
}): AgentStats {
  const { period, agent, estimate } = input;
  const previous = previousPeriod(period);
  const fromMs = period.from.getTime();
  const toMs = period.to.getTime();
  const current = input.runs.filter((r) => r.ranAt.getTime() >= fromMs && r.ranAt.getTime() < toMs);
  const a = aggregateAgent(current, indexFindings(input.findings), estimate);
  return {
    period: {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      previous_from: previous.from.toISOString(),
      previous_to: previous.to.toISOString(),
    },
    decided: a.decided,
    unpriced_runs: a.unpriced_runs,
    last_run_at: a.last_run_at,
    cost_basis: 'estimate',
    agent_id: agent.id,
    agent_name: agent.name,
    runs: a.runs,
    findings_total: a.findings_total,
    accepted: a.accepted,
    dismissed: a.dismissed,
    pending: a.pending,
    accept_rate: a.accept_rate,
    dismiss_rate: a.dismiss_rate,
    avg_findings_per_run: a.avg_findings_per_run,
    total_cost_usd: a.total_cost_usd,
    avg_cost_usd: a.avg_cost_usd,
    avg_latency_ms: a.avg_latency_ms,
    findings_by_severity: a.findings_by_severity,
    trend: a.trend,
  };
}
