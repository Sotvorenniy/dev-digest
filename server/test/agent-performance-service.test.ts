/**
 * SPEC-04 AgentPerformanceService against an in-memory fake of the repository port:
 * window selection, 404 on an unknown agent, the single metadata-only failure log (NFR8).
 */
import { describe, it, expect } from 'vitest';
import { AgentPerformanceService } from '../src/modules/agent-performance/service.js';
import { AggregationFailedError, type PerfAgent, type PerfRun, type PerfRunFindings, type Period } from '../src/modules/agent-performance/domain.js';
import type { AgentPerformanceRepositoryPort } from '../src/modules/agent-performance/ports.js';
import { NotFoundError } from '../src/platform/errors.js';

const DAY = 86_400_000;
const FROM = Date.parse('2026-10-10T00:00:00.000Z');
const period: Period = { from: new Date(FROM), to: new Date(FROM + DAY) };
const SECRET_NAME = 'Super Secret Agent Name';

class FakeRepo implements AgentPerformanceRepositoryPort {
  windows: Array<{ window: Period; agentId?: string }> = [];
  agents: PerfAgent[] = [{ id: 'a1', name: SECRET_NAME, provider: 'openai', model: 'priced' }];
  runs: PerfRun[] = [];
  failWith: Error | null = null;
  async listAgents() {
    return this.agents;
  }
  async findAgent(_ws: string, id: string) {
    return this.agents.find((a) => a.id === id) ?? null;
  }
  async listFinishedRuns(_ws: string, window: Period, agentId?: string) {
    if (this.failWith) throw this.failWith;
    this.windows.push({ window, agentId });
    return this.runs;
  }
  async countFindingsByRun(): Promise<PerfRunFindings[]> {
    return [];
  }
  async hasAnyFinishedRun() {
    return this.runs.length > 0;
  }
}

const make = (repo: FakeRepo) => new AgentPerformanceService({ repo, estimateCost: () => null });

describe('AgentPerformanceService', () => {
  it('performance reads the window [previous.from, to) in one go', async () => {
    const repo = new FakeRepo();
    await make(repo).performance('ws', period);
    expect(repo.windows).toHaveLength(1);
    expect(repo.windows[0]!.window.from.getTime()).toBe(FROM - DAY);
    expect(repo.windows[0]!.window.to.getTime()).toBe(FROM + DAY);
    expect(repo.windows[0]!.agentId).toBeUndefined();
  });

  it('agentStats reads only the current period, filtered by the agent', async () => {
    const repo = new FakeRepo();
    const stats = await make(repo).agentStats('ws', 'a1', period);
    expect(repo.windows[0]!.window.from.getTime()).toBe(FROM);
    expect(repo.windows[0]!.agentId).toBe('a1');
    expect(stats.agent_name).toBe(SECRET_NAME);
  });

  it('agentStats on an unknown agent throws NotFoundError and reads no runs', async () => {
    const repo = new FakeRepo();
    await expect(make(repo).agentStats('ws', 'nope', period)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.windows).toHaveLength(0);
  });

  it('NFR8: a failing read logs exactly one metadata-only line and rethrows AggregationFailedError (500)', async () => {
    const repo = new FakeRepo();
    repo.failWith = new Error(`db exploded near ${SECRET_NAME}`);
    const calls: unknown[][] = [];
    const logger = { error: (...a: unknown[]) => void calls.push(a) };
    const err = await make(repo).performance('ws', period, { logger }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AggregationFailedError);
    expect((err as AggregationFailedError).statusCode).toBe(500);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toEqual({
      event: 'agent_performance.failed',
      route: 'GET /agents/performance',
      from: period.from.toISOString(),
      to: period.to.toISOString(),
    });
    expect(JSON.stringify(calls)).not.toContain(SECRET_NAME);
    expect(JSON.stringify(calls)).not.toContain('exploded');
  });

  it('NFR8: agentStats failure logs its own route literal once', async () => {
    const repo = new FakeRepo();
    repo.failWith = new Error('boom');
    const calls: unknown[][] = [];
    await make(repo)
      .agentStats('ws', 'a1', period, { logger: { error: (...a: unknown[]) => void calls.push(a) } })
      .catch(() => undefined);
    expect(calls).toHaveLength(1);
    expect((calls[0]![0] as { route: string }).route).toBe('GET /agents/:id/stats');
  });

  it('AC20/NFR3: the repository port exposes read methods only and the service takes no LLM dependency', () => {
    const repo = new FakeRepo();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(repo)).filter((m) => m !== 'constructor');
    expect(methods.sort()).toEqual(['countFindingsByRun', 'findAgent', 'hasAnyFinishedRun', 'listAgents', 'listFinishedRuns']);
    const svc = make(repo) as unknown as { deps: Record<string, unknown> };
    expect(Object.keys(svc.deps).sort()).toEqual(['estimateCost', 'repo']);
  });
});
