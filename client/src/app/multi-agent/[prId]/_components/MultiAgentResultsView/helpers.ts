import type { AgentColumn, Conflict, ConflictTake } from "@/lib/types";

/** `?agents=a,b` → ids in URL order, empties dropped. */
export function parseAgentsParam(raw: string | null | undefined): string[] {
  return (raw ?? "").split(",").filter(Boolean);
}

/** Sum of durations and of the known costs; `costUsd` is null when no column has one. */
export function headerTotals(columns: AgentColumn[]): { durationMs: number; costUsd: number | null } {
  const costs = columns.map((c) => c.cost_usd).filter((c): c is number => c != null);
  return {
    durationMs: columns.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0),
    costUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
  };
}

export function visibleConflicts(conflicts: Conflict[], onlyConflicts: boolean): Conflict[] {
  return onlyConflicts ? conflicts.filter((c) => c.is_conflict) : conflicts;
}

export function cellFor(conflict: Conflict, agentId: string): ConflictTake | undefined {
  return conflict.takes.find((t) => t.agent_id === agentId);
}
