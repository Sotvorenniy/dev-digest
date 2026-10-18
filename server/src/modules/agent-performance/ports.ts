import type { PerfAgent, PerfRun, PerfRunFindings, Period } from './domain.js';

/** Read-only port AgentPerformanceService depends on — AgentPerformanceRepository implements it. */
export interface AgentPerformanceRepositoryPort {
  listAgents(workspaceId: string): Promise<PerfAgent[]>;
  /** The agent in this workspace, or null when absent / owned by another workspace. */
  findAgent(workspaceId: string, agentId: string): Promise<PerfAgent | null>;
  /** Finished runs (done / failed / cancelled) with `from <= ran_at < to`. */
  listFinishedRuns(workspaceId: string, window: Period, agentId?: string): Promise<PerfRun[]>;
  /** Finding counts per (run, severity) for the same runs; findings of unlinked reviews are excluded. */
  countFindingsByRun(workspaceId: string, window: Period, agentId?: string): Promise<PerfRunFindings[]>;
  hasAnyFinishedRun(workspaceId: string): Promise<boolean>;
}

/** Structured stdout logger (pino-compatible). */
export interface PerfLogger {
  error(obj: unknown, msg?: string): void;
}
