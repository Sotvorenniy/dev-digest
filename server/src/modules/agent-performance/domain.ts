import type {
  AgentPerf,
  AgentPerfRow,
  AgentStats,
  FindingsByCategory,
  MemoryUsage,
  MemoryUsageItem,
  PerfCostSegment,
  PerfMostActive,
  PerfSeriesPoint,
  SeverityBucketPoint,
  SkillsUsage,
  SkillUsageItem,
  StatPoint,
} from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { resolveRunCost, type CostEstimator } from '../../platform/run-cost.js';
import {
  DAY_MS,
  FINDING_CATEGORIES,
  HOUR_MS,
  HOURLY_BUCKET_MAX_MS,
  MEMORY_ITEMS_MAX,
  MEMORY_LABEL_MAX,
  SEVERITY_DAILY_MAX_MS,
  TREND_RUNS,
  WEEK_MS,
} from './constants.js';

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

/** Findings of an agent in the period, counted per category. */
export interface PerfCategoryCount {
  category: string;
  total: number;
}

/** Raw jsonb sub-values of one counted `done` run's trace; null when the run has no trace. */
export interface PerfRunTrace {
  runId: string;
  ranAt: Date;
  skillsUsed: unknown;
  memoryPulled: unknown;
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

/** 1 day buckets for periods up to 14 days, 7 day buckets beyond. */
export function severityBucketMs(p: Period): number {
  return p.to.getTime() - p.from.getTime() <= SEVERITY_DAILY_MAX_MS ? DAY_MS : WEEK_MS;
}

/** Findings per severity per time bucket, aligned to `from`; the last bucket is cut at `to`. */
export function severitySeries(p: Period, runs: PerfRun[], findingsByRun: FindingsByRun): SeverityBucketPoint[] {
  const size = severityBucketMs(p);
  const fromMs = p.from.getTime();
  const count = Math.max(1, Math.ceil((p.to.getTime() - fromMs) / size));
  const buckets: SeverityBucketPoint[] = Array.from({ length: count }, (_, i) => ({
    label: new Date(fromMs + i * size).toISOString(),
    CRITICAL: 0,
    WARNING: 0,
    SUGGESTION: 0,
  }));
  for (const r of runs) {
    const bucket = buckets[Math.floor((r.ranAt.getTime() - fromMs) / size)];
    if (!bucket) continue;
    for (const f of findingsByRun.get(r.id) ?? []) {
      if (f.severity === 'CRITICAL' || f.severity === 'WARNING' || f.severity === 'SUGGESTION') {
        bucket[f.severity] += f.total;
      }
    }
  }
  return buckets;
}

/** All six categories always present; anything outside the known five goes to `other`. */
export function categoryBreakdown(counts: PerfCategoryCount[]): FindingsByCategory {
  const out: FindingsByCategory = { bug: 0, security: 0, perf: 0, style: 0, test: 0, other: 0 };
  for (const c of counts) {
    const known = (FINDING_CATEGORIES as readonly string[]).includes(c.category);
    out[known ? (c.category as (typeof FINDING_CATEGORIES)[number]) : 'other'] += c.total;
  }
  return out;
}

/** Hand-written guard (no runtime zod in the core): an array of strings, else null. */
export function readSkillsUsed(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.every((x) => typeof x === 'string') ? (v as string[]) : null;
}

/** An array whose every element is an object with a string `text`, else null. `pr` only when an integer. */
export function readMemoryPulled(v: unknown): { pr: number | null; text: string }[] | null {
  if (!Array.isArray(v)) return null;
  const out: { pr: number | null; text: string }[] = [];
  for (const e of v) {
    if (typeof e !== 'object' || e === null || Array.isArray(e)) return null;
    const rec = e as Record<string, unknown>;
    if (typeof rec.text !== 'string') return null;
    out.push({ pr: Number.isInteger(rec.pr) ? (rec.pr as number) : null, text: rec.text });
  }
  return out;
}

function byRanAt(a: PerfRunTrace, b: PerfRunTrace): number {
  return a.ranAt.getTime() - b.ranAt.getTime();
}

export function skillsUsage(traces: PerfRunTrace[], linkedNames: ReadonlySet<string>): SkillsUsage {
  const counts = new Map<string, number>();
  let withData = 0;
  let dataFrom: Date | null = null;
  for (const tr of [...traces].sort(byRanAt)) {
    const names = readSkillsUsed(tr.skillsUsed);
    if (!names) continue;
    withData += 1;
    if (!dataFrom) dataFrom = tr.ranAt;
    for (const n of new Set(names)) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  for (const n of linkedNames) if (!counts.has(n)) counts.set(n, 0);
  const items: SkillUsageItem[] = [...counts.entries()].map(([name, runs]) => ({
    name,
    linked: linkedNames.has(name),
    runs,
    share: withData ? runs / withData : null,
  }));
  items.sort((a, b) => {
    if (a.share !== b.share) {
      if (a.share == null) return 1;
      if (b.share == null) return -1;
      return b.share - a.share;
    }
    return a.name.localeCompare(b.name);
  });
  return {
    runs_with_data: withData,
    runs_without_data: traces.length - withData,
    data_from: dataFrom ? (dataFrom as Date).toISOString() : null,
    items,
  };
}

export function memoryUsage(traces: PerfRunTrace[]): MemoryUsage {
  const groups = new Map<string, { runs: number; pr: number | null }>();
  let withData = 0;
  let dataFrom: Date | null = null;
  for (const tr of [...traces].sort(byRanAt)) {
    const pulls = readMemoryPulled(tr.memoryPulled);
    if (!pulls) continue;
    withData += 1;
    if (!dataFrom) dataFrom = tr.ranAt;
    const seen = new Set<string>();
    for (const p of pulls) {
      if (seen.has(p.text)) continue;
      seen.add(p.text);
      const g = groups.get(p.text);
      if (g) g.runs += 1;
      else groups.set(p.text, { runs: 1, pr: p.pr });
    }
  }
  const all: MemoryUsageItem[] = [...groups.entries()].map(([text, g]) => ({
    label: text.slice(0, MEMORY_LABEL_MAX),
    truncated: text.length > MEMORY_LABEL_MAX,
    pr: g.pr,
    runs: g.runs,
    share: withData ? g.runs / withData : null,
  }));
  all.sort((a, b) => (b.share ?? 0) - (a.share ?? 0) || a.label.localeCompare(b.label));
  return {
    runs_with_data: withData,
    runs_without_data: traces.length - withData,
    data_from: dataFrom ? (dataFrom as Date).toISOString() : null,
    entries_total: all.length,
    items: all.slice(0, MEMORY_ITEMS_MAX),
  };
}

export function buildAgentStats(input: {
  period: Period;
  agent: PerfAgent;
  /** Runs and findings cover `[previous.from, to)`. */
  runs: PerfRun[];
  findings: PerfRunFindings[];
  categories: PerfCategoryCount[];
  traces: PerfRunTrace[];
  linkedSkillNames: string[];
  hasAnyRuns: boolean;
  estimate: CostEstimator;
}): AgentStats {
  const { period, agent, estimate } = input;
  const previous = previousPeriod(period);
  const fromMs = period.from.getTime();
  const toMs = period.to.getTime();
  const prevFromMs = previous.from.getTime();
  const current = input.runs.filter((r) => r.ranAt.getTime() >= fromMs && r.ranAt.getTime() < toMs);
  const prior = input.runs.filter((r) => r.ranAt.getTime() >= prevFromMs && r.ranAt.getTime() < fromMs);
  const fbr = indexFindings(input.findings);
  const a = aggregateAgent(current, fbr, estimate);
  const prev = aggregateAgent(prior, fbr, estimate);
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
    has_any_runs: input.hasAnyRuns,
    previous_runs: prev.runs,
    previous_avg_cost_usd: prev.avg_cost_usd,
    previous_avg_latency_ms: prev.avg_latency_ms,
    previous_accept_rate: prev.accept_rate,
    previous_decided: prev.decided,
    runs_series: runsSeries(period, current),
    severity_bucket: severityBucketMs(period) === DAY_MS ? 'day' : 'week',
    findings_by_severity_series: severitySeries(period, current, fbr),
    findings_by_category: categoryBreakdown(input.categories),
    skills_usage: skillsUsage(input.traces, new Set(input.linkedSkillNames)),
    memory_usage: memoryUsage(input.traces),
  };
}
