import type {
  CreateEvalCaseBody,
  EvalCase,
  EvalCaseDraft,
  EvalCaseFields,
  EvalAgentDashboard,
  EvalCaseResult,
  EvalSetRun,
  EvalSetRunDetail,
  EvalWorkspaceDashboard,
  ReviewStrategy,
  UnifiedDiff,
} from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { NotFoundError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import {
  AgentRequiredError,
  DiffUnavailableError,
  FindingUndecidedError,
  NoEvalCasesError,
  ProviderNotConfiguredError,
  EvalRunActiveError,
  caseNameFor,
  decisionChanged,
  evalPrDescription,
  evalTaskLine,
  expectationTypeFor,
  latestAndPrevious,
  recallSeries,
  safeErrorMessage,
  scoreCase,
  scoreRun,
  trendPoints,
} from './domain.js';
import {
  AGENT_RUN_TABLE_LIMIT,
  AGENT_TREND_RUNS_LIMIT,
  EVAL_CASE_TIMEOUT_MS,
  EVAL_RESTART_REASON,
  EVAL_RUN_HISTORY_LIMIT,
  RECALL_SERIES_RUNS,
  RECENT_RUNS_LIMIT,
} from './constants.js';
import type {
  EvalAgentsPort,
  EvalCaseRecord,
  EvalCaseSnapshot,
  EvalLlmPort,
  EvalLogPort,
  EvalRepositoryPort,
  EvalSetRunRecord,
} from './ports.js';

/**
 * EvalService — turns decided findings into per-agent cases and runs an agent over
 * its whole case set. Depends on ports only (never `Container`). Scoring is pure code:
 * the only model calls are the per-case reviews. Logs carry ids, counts and status only.
 */

export interface EvalServiceDeps {
  repo: EvalRepositoryPort;
  agents: EvalAgentsPort;
  /** A provider that makes exactly one HTTP request per structured call. */
  llm: EvalLlmPort;
  providerConfigured: (provider: EvalSetRunRecord['provider']) => Promise<boolean>;
  /** Stored per-file patch → parsed diff. */
  parseDiff: (path: string, patch: string) => UnifiedDiff;
  now?: () => Date;
  timeoutMs?: number;
}

interface ServiceOpts {
  logger: EvalLogPort;
}

const errorClass = (err: unknown): string => (err instanceof Error ? err.name : 'UnknownError');

export class EvalService {
  /** runId → execution currently running; deleted on settle. */
  private inFlight = new Map<string, Promise<void>>();

  constructor(private readonly deps: EvalServiceDeps) {}

  // ---- cases ---------------------------------------------------------------

  /** Prefilled, unsaved case for the modal. Nothing is written. */
  async draftFromFinding(
    workspaceId: string,
    findingId: string,
    body: { agent_id?: string } | null | undefined,
  ): Promise<EvalCaseDraft> {
    const { ownerId, fields } = await this.resolveDraft(workspaceId, findingId, body?.agent_id);
    return { ...fields, agent_id: ownerId, source_finding_id: findingId };
  }

  async createCaseFromFinding(
    workspaceId: string,
    findingId: string,
    body: CreateEvalCaseBody | null | undefined,
    _opts: ServiceOpts,
  ): Promise<{ evalCase: EvalCase; created: boolean }> {
    // Checked before the decision so a later decision change still answers 200.
    const existing = await this.deps.repo.findCaseBySourceFinding(workspaceId, findingId);
    if (existing) return { evalCase: this.toEvalCase(existing, 'never_run'), created: false };

    const { ownerId, fields: built } = await this.resolveDraft(workspaceId, findingId, body?.agent_id);
    // The modal sends the warmed-up fields; without them the finding's own values are saved.
    const fields = body?.case ?? built;

    const { record, created } = await this.deps.repo.insertCase({
      workspaceId,
      ownerId,
      name: fields.name,
      inputDiff: fields.input_diff,
      inputFiles: fields.input_files,
      inputMeta: fields.input_meta,
      expected: fields.expected_output,
      sourceFindingId: findingId,
    });
    return { evalCase: this.toEvalCase(record, 'never_run'), created };
  }

  /** Run one unsaved case with the agent's current prompt. Persists nothing. */
  async runDraft(
    workspaceId: string,
    agentId: string,
    fields: EvalCaseFields,
    opts: ServiceOpts,
  ): Promise<EvalCaseResult> {
    const agent = await this.requireAgent(workspaceId, agentId);
    if (!(await this.deps.providerConfigured(agent.provider))) throw new ProviderNotConfiguredError();
    const llm = await this.deps.llm(agent.provider);
    const { result } = await this.reviewCase(
      { systemPrompt: agent.systemPrompt, model: agent.model, strategy: agent.strategy },
      llm,
      {
        id: null,
        name: fields.name,
        inputDiff: fields.input_diff,
        inputFiles: fields.input_files,
        inputMeta: fields.input_meta,
        expected: fields.expected_output,
      },
      this.deps.timeoutMs ?? EVAL_CASE_TIMEOUT_MS,
    );
    opts.logger.info(
      { agent_id: agentId, status: result.status, kept: result.kept.length, matched_items: result.matched_items },
      'eval.draft.finished',
    );
    return result;
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCase[]> {
    await this.requireAgent(workspaceId, agentId);
    const [cases, statuses] = await Promise.all([
      this.deps.repo.listCases(workspaceId, agentId),
      this.deps.repo.latestCaseStatuses(workspaceId, agentId),
    ]);
    return cases.map((c) => this.toEvalCase(c, statuses.get(c.id) ?? 'never_run'));
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    const removed = await this.deps.repo.deleteCase(workspaceId, caseId);
    if (!removed) throw new NotFoundError('Eval case not found');
  }

  // ---- runs ----------------------------------------------------------------

  async startRun(workspaceId: string, agentId: string, opts: ServiceOpts): Promise<EvalSetRun> {
    const agent = await this.requireAgent(workspaceId, agentId);
    if (await this.deps.repo.hasRunningRun(agentId)) throw new EvalRunActiveError();
    const cases = await this.deps.repo.listCases(workspaceId, agentId);
    if (cases.length === 0) throw new NoEvalCasesError();
    if (!(await this.deps.providerConfigured(agent.provider))) throw new ProviderNotConfiguredError();

    const caseSet: EvalCaseSnapshot[] = cases.map((c) => ({
      id: c.id,
      name: c.name,
      inputDiff: c.inputDiff,
      inputFiles: c.inputFiles,
      inputMeta: c.inputMeta,
      expected: c.expected,
    }));
    const run = await this.deps.repo.startRun({
      workspaceId,
      agentId,
      agentVersion: agent.version,
      provider: agent.provider,
      model: agent.model,
      strategy: agent.strategy,
      systemPrompt: agent.systemPrompt,
      caseSet,
    });
    opts.logger.info(
      {
        run_id: run.id,
        agent_id: agentId,
        agent_version: agent.version,
        case_count: caseSet.length,
        status: run.status,
      },
      'eval.run.started',
    );

    const settled = this.execute(run, caseSet, opts.logger).finally(() => {
      this.inFlight.delete(run.id);
    });
    this.inFlight.set(run.id, settled);
    return this.toRun(run);
  }

  /** Resolves when the run's background execution has settled (tests). */
  async waitFor(runId: string): Promise<void> {
    await this.inFlight.get(runId);
  }

  async getRun(workspaceId: string, runId: string): Promise<EvalSetRunDetail> {
    const run = await this.deps.repo.getRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Eval run not found');
    return { ...this.toRun(run), system_prompt: run.systemPrompt, results: run.results };
  }

  async listRuns(workspaceId: string, agentId: string): Promise<EvalSetRun[]> {
    await this.requireAgent(workspaceId, agentId);
    const runs = await this.deps.repo.listRuns(workspaceId, agentId, EVAL_RUN_HISTORY_LIMIT);
    return runs.map((r) => this.toRun(r));
  }

  // ---- dashboards (read-only) ------------------------------------------------

  async workspaceDashboard(workspaceId: string): Promise<EvalWorkspaceDashboard> {
    const agents = await this.deps.repo.listAgentsWithCases(workspaceId);
    const [runs, recent] = await Promise.all([
      this.deps.repo.listFinishedRunsPerAgent(
        workspaceId,
        agents.map((a) => a.agentId),
        RECALL_SERIES_RUNS,
      ),
      this.deps.repo.listRecentRuns(workspaceId, RECENT_RUNS_LIMIT),
    ]);
    const byAgent = new Map<string, EvalSetRunRecord[]>();
    for (const r of runs) {
      const list = byAgent.get(r.agentId);
      if (list) list.push(r);
      else byAgent.set(r.agentId, [r]);
    }
    return {
      agents: agents.map((a) => {
        const agentRuns = byAgent.get(a.agentId) ?? [];
        const { latest } = latestAndPrevious(agentRuns);
        return {
          agent_id: a.agentId,
          name: a.name,
          model: a.model,
          cases_total: a.casesTotal,
          latest: latest ? this.toRun(latest) : null,
          recall_series: recallSeries(agentRuns),
        };
      }),
      recent_runs: recent.map((r) => ({ ...this.toRun(r), agent_name: r.agentName })),
    };
  }

  async agentDashboard(workspaceId: string, agentId: string): Promise<EvalAgentDashboard> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const [finished, tableRuns, casesTotal] = await Promise.all([
      // Finished runs filtered in SQL so older ones are not hidden by newer failed/running rows.
      this.deps.repo.listFinishedRunsPerAgent(workspaceId, [agentId], AGENT_TREND_RUNS_LIMIT),
      this.deps.repo.listRunSummaries(workspaceId, {
        agentIds: [agentId],
        limit: AGENT_RUN_TABLE_LIMIT,
      }),
      this.deps.repo.countCases(workspaceId, agentId),
    ]);
    const { latest, previous } = latestAndPrevious(finished);
    return {
      agent_id: agent.id,
      name: agent.name,
      model: agent.model,
      cases_total: casesTotal,
      latest: latest ? this.toRun(latest) : null,
      previous: previous ? this.toRun(previous) : null,
      trend: trendPoints(finished),
      runs: tableRuns.map((r) => this.toRun(r)),
    };
  }

  /** Boot reaping: runs left `running` by a dead process. */
  async failStaleRuns(): Promise<number> {
    return this.deps.repo.failRunningRuns(EVAL_RESTART_REASON);
  }

  // ---- internals -----------------------------------------------------------

  private async execute(
    run: EvalSetRunRecord,
    caseSet: EvalCaseSnapshot[],
    logger: EvalLogPort,
  ): Promise<void> {
    const now = this.deps.now ?? (() => new Date());
    const timeoutMs = this.deps.timeoutMs ?? EVAL_CASE_TIMEOUT_MS;
    const results: EvalCaseResult[] = [];
    let costUsd: number | null = 0;
    try {
      const llm = await this.deps.llm(run.provider);
      for (const c of caseSet) {
        const { result, costUsd: caseCost } = await this.reviewCase(run, llm, c, timeoutMs);
        costUsd = costUsd === null || caseCost === null ? null : costUsd + caseCost;
        results.push(result);
        logger.info(
          {
            run_id: run.id,
            case_id: c.id,
            status: result.status,
            kept: result.kept.length,
            dropped: result.dropped.length,
            matched_items: result.matched_items,
          },
          'eval.case.finished',
        );
      }

      const okIds = new Set(results.filter((r) => r.status !== 'error').map((r) => r.case_id));
      const mustFindItems = caseSet
        .filter((c) => okIds.has(c.id) && c.expected.type === 'must_find')
        .reduce((n, c) => n + c.expected.items.length, 0);
      const score = scoreRun(results, mustFindItems);
      const durationMs = Math.max(0, now().getTime() - run.startedAt.getTime());
      await this.deps.repo.completeRun(run.id, {
        status: score.status,
        casesTotal: score.cases_total,
        casesPassed: score.cases_passed,
        casesErrored: score.cases_errored,
        recall: score.recall,
        precision: score.precision,
        citationAccuracy: score.citation_accuracy,
        costUsd,
        durationMs,
        results,
      });
      logger.info(
        {
          run_id: run.id,
          agent_id: run.agentId,
          agent_version: run.agentVersion,
          case_count: caseSet.length,
          status: score.status,
          duration_ms: durationMs,
        },
        'eval.run.finished',
      );
    } catch (err) {
      // Never leave a run `running`: the 409 guard would stick until the next restart.
      logger.warn({ run_id: run.id, error_class: errorClass(err) }, 'eval.run.failed');
      try {
        await this.deps.repo.completeRun(run.id, {
          status: 'failed',
          error: 'Eval run failed unexpectedly',
          casesTotal: caseSet.length,
          casesPassed: 0,
          casesErrored: results.length,
          recall: null,
          precision: null,
          citationAccuracy: null,
          costUsd: null,
          durationMs: Math.max(0, now().getTime() - run.startedAt.getTime()),
          results,
        });
      } catch (inner) {
        logger.warn({ run_id: run.id, error_class: errorClass(inner) }, 'eval.run.fail_mark_failed');
      }
    }
  }

  /** Finding → owner agent and the case fields built from it. Throws when the finding cannot become a case. */
  private async resolveDraft(
    workspaceId: string,
    findingId: string,
    agentId: string | undefined,
  ): Promise<{ ownerId: string; fields: EvalCaseFields }> {
    const source = await this.deps.repo.findFindingSource(workspaceId, findingId);
    if (!source) throw new NotFoundError('Finding not found');

    const type = expectationTypeFor(source);
    if (!type) throw new FindingUndecidedError();

    let ownerId: string | null = null;
    if (source.reviewAgentId) {
      const reviewAgent = await this.deps.agents.getAgent(workspaceId, source.reviewAgentId);
      if (reviewAgent) ownerId = reviewAgent.id;
    }
    if (!ownerId) {
      if (!agentId) throw new AgentRequiredError();
      const chosen = await this.deps.agents.getAgent(workspaceId, agentId);
      if (!chosen) throw new NotFoundError('Agent not found');
      ownerId = chosen.id;
    }

    if (!source.filePatch) throw new DiffUnavailableError();

    return {
      ownerId,
      fields: {
        name: caseNameFor(source.title, source.file, source.startLine),
        input_diff: source.filePatch,
        input_files: [source.file],
        input_meta: { pr_number: source.prNumber, title: source.prTitle, body: source.prBody },
        expected_output: {
          type,
          items: [
            {
              file: source.file,
              start_line: source.startLine,
              end_line: source.endLine,
              title: source.title,
              severity: source.severity,
              category: source.category,
            },
          ],
        },
      },
    };
  }

  /** One case through the reviewer and the scorer. Never throws: a failure becomes an `error` result. */
  private async reviewCase(
    cfg: { systemPrompt: string; model: string; strategy: string },
    llm: Awaited<ReturnType<EvalServiceDeps['llm']>>,
    c: Omit<EvalCaseSnapshot, 'id'> & { id: string | null },
    timeoutMs: number,
  ): Promise<{ result: EvalCaseResult; costUsd: number | null }> {
    try {
      const path = c.inputFiles[0] ?? c.expected.items[0]?.file ?? '';
      const outcome = await withTimeout(
        reviewPullRequest({
          systemPrompt: cfg.systemPrompt,
          model: cfg.model,
          strategy: cfg.strategy as ReviewStrategy,
          diff: this.deps.parseDiff(path, c.inputDiff),
          llm,
          prDescription: evalPrDescription(c.inputMeta),
          task: evalTaskLine(c.inputMeta),
        }),
        timeoutMs,
      );
      const kept = outcome.review.findings.map((f) => ({
        file: f.file,
        start_line: f.start_line,
        end_line: f.end_line,
        title: f.title,
        severity: f.severity,
        category: f.category,
      }));
      const dropped = outcome.dropped.map((d) => ({
        file: d.finding.file,
        start_line: d.finding.start_line,
        end_line: d.finding.end_line,
        title: d.finding.title,
        reason: d.reason,
      }));
      return {
        result: { case_id: c.id, case_name: c.name, error: null, ...scoreCase(c.expected, kept, dropped) },
        costUsd: outcome.costUsd,
      };
    } catch (err) {
      return {
        result: {
          case_id: c.id,
          case_name: c.name,
          expectation_type: c.expected.type,
          status: 'error',
          error: safeErrorMessage(err),
          kept: [],
          dropped: [],
          matched_items: 0,
        },
        costUsd: null,
      };
    }
  }

  private async requireAgent(workspaceId: string, agentId: string) {
    const agent = await this.deps.agents.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private toEvalCase(c: EvalCaseRecord, lastStatus: EvalCase['last_status']): EvalCase {
    return {
      id: c.id,
      owner_kind: 'agent',
      owner_id: c.ownerId,
      name: c.name,
      input_diff: c.inputDiff,
      input_files: c.inputFiles,
      input_meta: c.inputMeta,
      expected_output: c.expected,
      source_finding_id: c.sourceFindingId,
      decision_changed: decisionChanged(c.expected.type, c.sourceDecision),
      last_status: lastStatus,
      notes: c.notes,
    };
  }

  private toRun(r: EvalSetRunRecord): EvalSetRun {
    return {
      id: r.id,
      agent_id: r.agentId,
      agent_version: r.agentVersion,
      model: r.model,
      strategy: r.strategy,
      status: r.status,
      started_at: r.startedAt.toISOString(),
      finished_at: r.finishedAt ? r.finishedAt.toISOString() : null,
      cases_total: r.casesTotal,
      cases_passed: r.casesPassed,
      cases_errored: r.casesErrored,
      recall: r.recall,
      precision: r.precision,
      citation_accuracy: r.citationAccuracy,
      cost_usd: r.costUsd,
      duration_ms: r.durationMs,
    };
  }
}
