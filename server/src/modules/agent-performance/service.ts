import type { AgentPerf, AgentStats } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { CostEstimator } from '../../platform/run-cost.js';
import {
  AggregationFailedError,
  buildAgentPerformance,
  buildAgentStats,
  previousPeriod,
  type Period,
} from './domain.js';
import type { AgentPerformanceRepositoryPort, PerfLogger } from './ports.js';

export interface AgentPerformanceDeps {
  repo: AgentPerformanceRepositoryPort;
  estimateCost: CostEstimator;
}

/** Read-only per-agent aggregation over agent_runs + findings. No write, no model call. */
export class AgentPerformanceService {
  constructor(private readonly deps: AgentPerformanceDeps) {}

  async performance(workspaceId: string, period: Period, ctx: { logger?: PerfLogger } = {}): Promise<AgentPerf> {
    const { repo, estimateCost } = this.deps;
    try {
      const window = { from: previousPeriod(period).from, to: period.to };
      const [agents, runs, findings, hasAnyRuns] = await Promise.all([
        repo.listAgents(workspaceId),
        repo.listFinishedRuns(workspaceId, window),
        repo.countFindingsByRun(workspaceId, window),
        repo.hasAnyFinishedRun(workspaceId),
      ]);
      return buildAgentPerformance({ period, agents, runs, findings, hasAnyRuns, estimate: estimateCost });
    } catch (err) {
      this.fail(ctx, 'GET /agents/performance', period);
      throw err instanceof AggregationFailedError ? err : new AggregationFailedError();
    }
  }

  async agentStats(
    workspaceId: string,
    agentId: string,
    period: Period,
    ctx: { logger?: PerfLogger } = {},
  ): Promise<AgentStats> {
    const { repo, estimateCost } = this.deps;
    const agent = await repo.findAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    try {
      const [runs, findings] = await Promise.all([
        repo.listFinishedRuns(workspaceId, period, agentId),
        repo.countFindingsByRun(workspaceId, period, agentId),
      ]);
      return buildAgentStats({ period, agent, runs, findings, estimate: estimateCost });
    } catch {
      this.fail(ctx, 'GET /agents/:id/stats', period);
      throw new AggregationFailedError();
    }
  }

  /** Metadata only: route and period — never agent names, model slugs or the error text. */
  private fail(ctx: { logger?: PerfLogger }, route: string, period: Period): void {
    ctx.logger?.error(
      { event: 'agent_performance.failed', route, from: period.from.toISOString(), to: period.to.toISOString() },
      'agent_performance.failed',
    );
  }
}
