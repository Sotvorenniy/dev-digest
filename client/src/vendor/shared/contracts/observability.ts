import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** A finding as surfaced in a multi-agent column (subset of FindingRecord). */
export const AgentColumnFinding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  kind: z.string().nullish(),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['done', 'failed', 'running']),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a contended file:line. */
export const ConflictTake = z.object({
  agent_id: z.string(),
  persona: z.string(),
  /** Severity if the agent flagged it, or 'ignored' when it did not. */
  verdict: z.union([Severity, z.literal('ignored')]),
  note: z.string(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * A conflict = a file:line that at least one agent flagged and at least one
 * other agent (that also reviewed) did NOT, OR where agents assigned divergent
 * severities. Computed from persisted findings; not stored.
 */
export const Conflict = z.object({
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of POST /pulls/:id/multi-agent-run and GET /pulls/:id/multi-agent. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

/** The selected period and the equal-length previous period (ISO strings). */
export const PerfPeriod = z.object({
  from: z.string(),
  to: z.string(),
  previous_from: z.string(),
  previous_to: z.string(),
});
export type PerfPeriod = z.infer<typeof PerfPeriod>;

/** Same shape as PerfSeriesPoint (productionize.ts imports this file, so it cannot be imported back). */
export const AgentStatsSeriesPoint = z.object({ label: z.string(), value: z.number().int() });
export type AgentStatsSeriesPoint = z.infer<typeof AgentStatsSeriesPoint>;

export const SeverityBucketPoint = z.object({
  label: z.string(),
  CRITICAL: z.number().int(),
  WARNING: z.number().int(),
  SUGGESTION: z.number().int(),
});
export type SeverityBucketPoint = z.infer<typeof SeverityBucketPoint>;

export const FindingsByCategory = z.object({
  bug: z.number().int(),
  security: z.number().int(),
  perf: z.number().int(),
  style: z.number().int(),
  test: z.number().int(),
  other: z.number().int(),
});
export type FindingsByCategory = z.infer<typeof FindingsByCategory>;

export const SkillUsageItem = z.object({
  name: z.string(),
  linked: z.boolean(),
  runs: z.number().int(),
  share: z.number().nullable(),
});
export type SkillUsageItem = z.infer<typeof SkillUsageItem>;

export const SkillsUsage = z.object({
  runs_with_data: z.number().int(),
  runs_without_data: z.number().int(),
  data_from: z.string().nullable(),
  items: z.array(SkillUsageItem),
});
export type SkillsUsage = z.infer<typeof SkillsUsage>;

export const MemoryUsageItem = z.object({
  label: z.string().max(200),
  truncated: z.boolean(),
  pr: z.number().int().nullish(),
  runs: z.number().int(),
  share: z.number().nullable(),
});
export type MemoryUsageItem = z.infer<typeof MemoryUsageItem>;

export const MemoryUsage = z.object({
  runs_with_data: z.number().int(),
  runs_without_data: z.number().int(),
  data_from: z.string().nullable(),
  entries_total: z.number().int(),
  items: z.array(MemoryUsageItem).max(10),
});
export type MemoryUsage = z.infer<typeof MemoryUsage>;

export const AgentStats = z.object({
  period: PerfPeriod,
  decided: z.number().int(),
  unpriced_runs: z.number().int(),
  last_run_at: z.string().nullable(),
  cost_basis: z.literal('estimate'),
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
  has_any_runs: z.boolean(),
  previous_runs: z.number().int(),
  previous_avg_cost_usd: z.number().nullable(),
  previous_avg_latency_ms: z.number().nullable(),
  previous_accept_rate: z.number().nullable(),
  previous_decided: z.number().int(),
  runs_series: z.array(AgentStatsSeriesPoint),
  severity_bucket: z.enum(['day', 'week']),
  findings_by_severity_series: z.array(SeverityBucketPoint),
  findings_by_category: FindingsByCategory,
  skills_usage: SkillsUsage,
  memory_usage: MemoryUsage,
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
