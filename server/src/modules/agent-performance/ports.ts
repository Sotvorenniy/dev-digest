import type { PerfAgent, PerfCategoryCount, PerfRun, PerfRunFindings, PerfRunTrace, Period } from './domain.js';

/** Read-only port AgentPerformanceService depends on — AgentPerformanceRepository implements it. */
export interface AgentPerformanceRepositoryPort {
  listAgents(workspaceId: string): Promise<PerfAgent[]>;
  /** The agent in this workspace, or null when absent / owned by another workspace. */
  findAgent(workspaceId: string, agentId: string): Promise<PerfAgent | null>;
  /** Finished runs (done / failed / cancelled) with `from <= ran_at < to`. */
  listFinishedRuns(workspaceId: string, window: Period, agentId?: string): Promise<PerfRun[]>;
  /** Finding counts per (run, severity) for the same runs; findings of unlinked reviews are excluded. */
  countFindingsByRun(workspaceId: string, window: Period, agentId?: string): Promise<PerfRunFindings[]>;
  /** Finding counts per category for the agent's done/failed/cancelled runs in the period (same joins as above). */
  countFindingsByCategory(workspaceId: string, period: Period, agentId: string): Promise<PerfCategoryCount[]>;
  /** Skills/memory sub-values of the trace of each `done` run in the period; never the whole trace. */
  listRunUsageTraces(workspaceId: string, period: Period, agentId: string): Promise<PerfRunTrace[]>;
  /** Names of the skills linked to the agent. */
  listLinkedSkillNames(workspaceId: string, agentId: string): Promise<string[]>;
  hasAnyFinishedRun(workspaceId: string, agentId?: string): Promise<boolean>;
}

/** Structured stdout logger (pino-compatible). */
export interface PerfLogger {
  error(obj: unknown, msg?: string): void;
}
