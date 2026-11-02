import type { AgentStats, PrMeta } from "@/lib/types";

export interface Estimate {
  durationMs: number;
  costUsd: number;
}

/** Per-run estimate from an agent's stats, or null when there is no usable history. */
export function estimateOf(stats?: AgentStats): Estimate | null {
  if (!stats || stats.runs === 0) return null;
  if (stats.avg_latency_ms == null || stats.avg_cost_usd == null) return null;
  return { durationMs: stats.avg_latency_ms, costUsd: stats.avg_cost_usd };
}

export function sumEstimates(list: Array<Estimate | null>): Estimate {
  return list.reduce<Estimate>(
    (acc, e) => (e ? { durationMs: acc.durationMs + e.durationMs, costUsd: acc.costUsd + e.costUsd } : acc),
    { durationMs: 0, costUsd: 0 },
  );
}

/** PRs that can still be reviewed here: persisted (have an id) and not merged/closed. */
export function openPulls(pulls: PrMeta[]): Array<PrMeta & { id: string }> {
  return pulls.filter((p): p is PrMeta & { id: string } => !!p.id && p.status !== "merged" && p.status !== "closed");
}
