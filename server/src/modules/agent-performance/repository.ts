import { and, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { FINISHED_RUN_STATUSES } from './constants.js';
import type { PerfAgent, PerfCategoryCount, PerfRun, PerfRunFindings, PerfRunTrace, Period } from './domain.js';
import type { AgentPerformanceRepositoryPort } from './ports.js';

/** Read-only agents / agent_runs / reviews / findings queries. Implements AgentPerformanceRepositoryPort. */
export class AgentPerformanceRepository implements AgentPerformanceRepositoryPort {
  constructor(private readonly db: Db) {}

  async listAgents(workspaceId: string): Promise<PerfAgent[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name, provider: t.agents.provider, model: t.agents.model })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
  }

  async findAgent(workspaceId: string, agentId: string): Promise<PerfAgent | null> {
    const [row] = await this.db
      .select({ id: t.agents.id, name: t.agents.name, provider: t.agents.provider, model: t.agents.model })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row ?? null;
  }

  async listFinishedRuns(workspaceId: string, window: Period, agentId?: string): Promise<PerfRun[]> {
    const rows = await this.db
      .select({
        id: t.agentRuns.id,
        agentId: t.agentRuns.agentId,
        ranAt: t.agentRuns.ranAt,
        model: t.agentRuns.model,
        durationMs: t.agentRuns.durationMs,
        tokensIn: t.agentRuns.tokensIn,
        tokensOut: t.agentRuns.tokensOut,
        costUsd: t.agentRuns.costUsd,
        status: t.agentRuns.status,
      })
      .from(t.agentRuns)
      .where(this.runFilter(workspaceId, window, agentId));
    return rows.map((r) => ({ ...r, status: r.status as PerfRun['status'] }));
  }

  async countFindingsByRun(workspaceId: string, window: Period, agentId?: string): Promise<PerfRunFindings[]> {
    const rows = await this.db
      .select({
        runId: t.reviews.runId,
        severity: t.findings.severity,
        total: sql<number>`count(*)::int`,
        accepted: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)::int`,
        dismissed: sql<number>`count(*) filter (where ${t.findings.dismissedAt} is not null and ${t.findings.acceptedAt} is null)::int`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.agentRuns, eq(t.reviews.runId, t.agentRuns.id))
      .where(and(this.runFilter(workspaceId, window, agentId), eq(t.reviews.workspaceId, workspaceId)))
      .groupBy(t.reviews.runId, t.findings.severity);
    return rows.map((r) => ({
      runId: r.runId as string,
      severity: r.severity,
      total: r.total,
      accepted: r.accepted,
      dismissed: r.dismissed,
    }));
  }

  async countFindingsByCategory(workspaceId: string, period: Period, agentId: string): Promise<PerfCategoryCount[]> {
    return this.db
      .select({ category: t.findings.category, total: sql<number>`count(*)::int` })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.agentRuns, eq(t.reviews.runId, t.agentRuns.id))
      .where(and(this.runFilter(workspaceId, period, agentId), eq(t.reviews.workspaceId, workspaceId)))
      .groupBy(t.findings.category);
  }

  async listRunUsageTraces(workspaceId: string, period: Period, agentId: string): Promise<PerfRunTrace[]> {
    // Only two sub-paths of the trace are projected; the whole document is never selected.
    const rows = await this.db
      .select({
        runId: t.agentRuns.id,
        ranAt: t.agentRuns.ranAt,
        skillsUsed: sql<unknown>`case when jsonb_typeof(${t.runTraces.trace}) = 'object' then ${t.runTraces.trace} #> '{prompt_assembly,skills_used}' end`,
        memoryPulled: sql<unknown>`case when jsonb_typeof(${t.runTraces.trace}) = 'object' then ${t.runTraces.trace} -> 'memory_pulled' end`,
      })
      .from(t.agentRuns)
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(and(this.runFilter(workspaceId, period, agentId), eq(t.agentRuns.status, 'done')));
    return rows;
  }

  async listLinkedSkillNames(workspaceId: string, agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: t.skills.name })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.workspaceId, workspaceId)));
    return rows.map((r) => r.name);
  }

  async hasAnyFinishedRun(workspaceId: string, agentId?: string): Promise<boolean> {
    const rows = await this.db
      .select({ one: sql<number>`1` })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.status, [...FINISHED_RUN_STATUSES]),
          agentId ? eq(t.agentRuns.agentId, agentId) : undefined,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** Workspace + half-open window + finished status (+ agent). `from`/`to` are bound parameters. */
  private runFilter(workspaceId: string, window: Period, agentId?: string): SQL | undefined {
    return and(
      eq(t.agentRuns.workspaceId, workspaceId),
      gte(t.agentRuns.ranAt, window.from),
      lt(t.agentRuns.ranAt, window.to),
      inArray(t.agentRuns.status, [...FINISHED_RUN_STATUSES]),
      agentId ? eq(t.agentRuns.agentId, agentId) : undefined,
    );
  }
}
