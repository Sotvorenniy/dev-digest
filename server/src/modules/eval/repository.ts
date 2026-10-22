import { and, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import type { EvalCaseResult, EvalExpectedOutput, EvalInputMeta, UnifiedDiff } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { EVAL_RUN_HISTORY_LIMIT } from './constants.js';
import { EvalCaseConflictError, EvalRunActiveError } from './domain.js';
import type {
  CompleteEvalRun,
  EvalAgentCaseCount,
  EvalCaseRecord,
  EvalRecentRunRecord,
  EvalFindingSource,
  EvalRepositoryPort,
  EvalSetRunRecord,
  EvalCasePatch,
  NewEvalCase,
  StartEvalRun,
} from './ports.js';

/** The stored per-file patch rebuilt into a parsed diff (EC20: path is the stored new-side file). */
export function parseCaseDiff(rawPath: string, patch: string): UnifiedDiff {
  // CR/LF/NUL in a path would forge extra header lines in the synthetic diff.
  const path = rawPath.replace(/[\r\n\0]/g, '');
  return parseUnifiedDiff(
    [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, patch].join('\n'),
  );
}

type CaseRow = typeof t.evalCases.$inferSelect;
type RunRow = typeof t.evalSetRuns.$inferSelect;
type FindingDecision = { acceptedAt: Date | null; dismissedAt: Date | null } | null;

function toCaseRecord(row: CaseRow, decision: FindingDecision): EvalCaseRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ownerId: row.ownerId,
    name: row.name,
    inputDiff: row.inputDiff ?? '',
    inputFiles: (row.inputFiles as string[] | null) ?? [],
    inputMeta: row.inputMeta as EvalInputMeta,
    expected: row.expectedOutput as EvalExpectedOutput,
    sourceFindingId: row.sourceFindingId,
    notes: row.notes,
    sourceDecision: decision,
  };
}

type RunSummaryRow = Omit<RunRow, 'systemPrompt' | 'results' | 'caseSet'>;

function toRunRecord(
  row: RunSummaryRow & Partial<Pick<RunRow, 'systemPrompt' | 'results'>>,
): EvalSetRunRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    agentVersion: row.agentVersion,
    provider: row.provider as EvalSetRunRecord['provider'],
    model: row.model,
    strategy: row.strategy,
    systemPrompt: row.systemPrompt ?? '',
    status: row.status,
    error: row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    casesTotal: row.casesTotal,
    casesPassed: row.casesPassed,
    casesErrored: row.casesErrored,
    recall: row.recall,
    precision: row.precision,
    citationAccuracy: row.citationAccuracy,
    costUsd: row.costUsd,
    durationMs: row.durationMs,
    results: (row.results as EvalCaseResult[] | null) ?? [],
  };
}

/** Summary columns only: system_prompt / results / case_set stay out of list reads. */
const runSummaryColumns = {
  id: t.evalSetRuns.id,
  workspaceId: t.evalSetRuns.workspaceId,
  agentId: t.evalSetRuns.agentId,
  agentVersion: t.evalSetRuns.agentVersion,
  provider: t.evalSetRuns.provider,
  model: t.evalSetRuns.model,
  strategy: t.evalSetRuns.strategy,
  status: t.evalSetRuns.status,
  error: t.evalSetRuns.error,
  startedAt: t.evalSetRuns.startedAt,
  finishedAt: t.evalSetRuns.finishedAt,
  casesTotal: t.evalSetRuns.casesTotal,
  casesPassed: t.evalSetRuns.casesPassed,
  casesErrored: t.evalSetRuns.casesErrored,
  recall: t.evalSetRuns.recall,
  precision: t.evalSetRuns.precision,
  citationAccuracy: t.evalSetRuns.citationAccuracy,
  costUsd: t.evalSetRuns.costUsd,
  durationMs: t.evalSetRuns.durationMs,
};

/** A running run sorts by its start; a finished one by its finish. */
const runSortKey = sql`coalesce(${t.evalSetRuns.finishedAt}, ${t.evalSetRuns.startedAt})`;

function summaryToRecord(r: RunSummaryRow): EvalSetRunRecord {
  return toRunRecord(r);
}

/** Postgres unique violation, however the driver wraps it. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** eval_cases / eval_set_runs access plus the finding → PR → file-patch read for the eval module. */
export class EvalRepository implements EvalRepositoryPort {
  constructor(private readonly db: Db) {}

  async findFindingSource(
    workspaceId: string,
    findingId: string,
  ): Promise<EvalFindingSource | undefined> {
    const [row] = await this.db
      .select({ finding: t.findings, review: t.reviews, pr: t.pullRequests })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .where(and(eq(t.findings.id, findingId), eq(t.reviews.workspaceId, workspaceId)));
    if (!row) return undefined;
    const [fileRow] = await this.db
      .select({ patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(and(eq(t.prFiles.prId, row.pr.id), eq(t.prFiles.path, row.finding.file)));
    return {
      findingId: row.finding.id,
      file: row.finding.file,
      startLine: row.finding.startLine,
      endLine: row.finding.endLine,
      title: row.finding.title,
      severity: row.finding.severity as EvalFindingSource['severity'],
      category: row.finding.category as EvalFindingSource['category'],
      acceptedAt: row.finding.acceptedAt,
      dismissedAt: row.finding.dismissedAt,
      reviewAgentId: row.review.agentId,
      prNumber: row.pr.number,
      prTitle: row.pr.title,
      prBody: row.pr.body,
      filePatch: fileRow?.patch ?? null,
    };
  }

  async findCaseBySourceFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<EvalCaseRecord | undefined> {
    const [row] = await this.db
      .select({ c: t.evalCases, f: t.findings })
      .from(t.evalCases)
      .leftJoin(t.findings, eq(t.findings.id, t.evalCases.sourceFindingId))
      .where(
        and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.sourceFindingId, findingId)),
      );
    return row ? toCaseRecord(row.c, row.f ?? null) : undefined;
  }

  async insertCase(values: NewEvalCase): Promise<{ record: EvalCaseRecord; created: boolean }> {
    const [inserted] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: 'agent',
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff,
        inputFiles: values.inputFiles,
        inputMeta: values.inputMeta,
        expectedOutput: values.expected,
        sourceFindingId: values.sourceFindingId,
      })
      .onConflictDoNothing({ target: t.evalCases.sourceFindingId })
      .returning();
    if (inserted) {
      const record = await this.findCaseBySourceFinding(values.workspaceId, values.sourceFindingId);
      return { record: record ?? toCaseRecord(inserted, null), created: true };
    }
    const existing = await this.findCaseBySourceFinding(values.workspaceId, values.sourceFindingId);
    if (!existing) throw new EvalCaseConflictError();
    return { record: existing, created: false };
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]> {
    const rows = await this.db
      .select({ c: t.evalCases, f: t.findings })
      .from(t.evalCases)
      .leftJoin(t.findings, eq(t.findings.id, t.evalCases.sourceFindingId))
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(t.evalCases.createdAt, t.evalCases.id);
    return rows.map((r) => toCaseRecord(r.c, r.f ?? null));
  }

  async insertManualCase(values: Omit<NewEvalCase, 'sourceFindingId'>): Promise<EvalCaseRecord> {
    const [inserted] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: 'agent',
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff,
        inputFiles: values.inputFiles,
        inputMeta: values.inputMeta,
        expectedOutput: values.expected,
        sourceFindingId: null,
      })
      .returning();
    return toCaseRecord(inserted!, null);
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: EvalCasePatch,
  ): Promise<EvalCaseRecord | undefined> {
    const updated = await this.db
      .update(t.evalCases)
      .set({
        name: patch.name,
        inputDiff: patch.inputDiff,
        inputFiles: patch.inputFiles,
        inputMeta: patch.inputMeta,
        expectedOutput: patch.expected,
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    if (updated.length === 0) return undefined;
    const [row] = await this.db
      .select({ c: t.evalCases, f: t.findings })
      .from(t.evalCases)
      .leftJoin(t.findings, eq(t.findings.id, t.evalCases.sourceFindingId))
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
    return row ? toCaseRecord(row.c, row.f ?? null) : undefined;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async countCases(workspaceId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      );
    return row?.n ?? 0;
  }

  async startRun(values: StartEvalRun): Promise<EvalSetRunRecord> {
    try {
      const [row] = await this.db
        .insert(t.evalSetRuns)
        .values({
          workspaceId: values.workspaceId,
          agentId: values.agentId,
          agentVersion: values.agentVersion,
          provider: values.provider,
          model: values.model,
          strategy: values.strategy,
          systemPrompt: values.systemPrompt,
          status: 'running',
          casesTotal: values.caseSet.length,
          caseSet: values.caseSet,
        })
        .returning();
      return toRunRecord(row!);
    } catch (err) {
      if (isUniqueViolation(err)) throw new EvalRunActiveError();
      throw err;
    }
  }

  async hasRunningRun(agentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: t.evalSetRuns.id })
      .from(t.evalSetRuns)
      .where(and(eq(t.evalSetRuns.agentId, agentId), eq(t.evalSetRuns.status, 'running')))
      .limit(1);
    return rows.length > 0;
  }

  async completeRun(runId: string, patch: CompleteEvalRun): Promise<void> {
    await this.db
      .update(t.evalSetRuns)
      .set({
        status: patch.status,
        error: patch.error ?? null,
        finishedAt: new Date(),
        casesTotal: patch.casesTotal,
        casesPassed: patch.casesPassed,
        casesErrored: patch.casesErrored,
        recall: patch.recall,
        precision: patch.precision,
        citationAccuracy: patch.citationAccuracy,
        costUsd: patch.costUsd,
        durationMs: patch.durationMs,
        results: patch.results,
      })
      .where(eq(t.evalSetRuns.id, runId));
  }

  async getRun(workspaceId: string, runId: string): Promise<EvalSetRunRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSetRuns)
      .where(and(eq(t.evalSetRuns.workspaceId, workspaceId), eq(t.evalSetRuns.id, runId)));
    return row ? toRunRecord(row) : undefined;
  }

  async listRuns(workspaceId: string, agentId: string, limit: number): Promise<EvalSetRunRecord[]> {
    // Summary columns only: system_prompt / results / case_set stay out of the list read.
    const rows = await this.db
      .select(runSummaryColumns)
      .from(t.evalSetRuns)
      .where(and(eq(t.evalSetRuns.workspaceId, workspaceId), eq(t.evalSetRuns.agentId, agentId)))
      .orderBy(desc(t.evalSetRuns.startedAt))
      .limit(limit);
    return rows.map(summaryToRecord);
  }

  /** Newest-first walk over finished runs; a case keeps the first result seen (R1). */
  async latestCaseStatuses(
    workspaceId: string,
    agentId: string,
  ): Promise<Map<string, 'pass' | 'fail' | 'error'>> {
    // Bounded to the same window the history list shows, so the jsonb read stays small.
    const rows = await this.db
      .select({ results: t.evalSetRuns.results })
      .from(t.evalSetRuns)
      .where(
        and(
          eq(t.evalSetRuns.workspaceId, workspaceId),
          eq(t.evalSetRuns.agentId, agentId),
          ne(t.evalSetRuns.status, 'running'),
        ),
      )
      .orderBy(desc(t.evalSetRuns.startedAt), desc(t.evalSetRuns.id))
      .limit(EVAL_RUN_HISTORY_LIMIT);
    const out = new Map<string, 'pass' | 'fail' | 'error'>();
    for (const row of rows) {
      for (const r of (row.results as EvalCaseResult[] | null) ?? []) {
        if (r.case_id && !out.has(r.case_id)) out.set(r.case_id, r.status);
      }
    }
    return out;
  }

  async listAgentsWithCases(workspaceId: string): Promise<EvalAgentCaseCount[]> {
    const rows = await this.db
      .select({
        agentId: t.agents.id,
        name: t.agents.name,
        model: t.agents.model,
        casesTotal: sql<number>`count(${t.evalCases.id})::int`,
      })
      .from(t.evalCases)
      .innerJoin(t.agents, eq(t.agents.id, t.evalCases.ownerId))
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.agents.workspaceId, workspaceId),
        ),
      )
      .groupBy(t.agents.id, t.agents.name, t.agents.model)
      .orderBy(t.agents.name, t.agents.id);
    return rows;
  }

  async listRunSummaries(
    workspaceId: string,
    opts: { agentIds?: string[]; limit?: number } = {},
  ): Promise<EvalSetRunRecord[]> {
    if (opts.agentIds && opts.agentIds.length === 0) return [];
    const query = this.db
      .select(runSummaryColumns)
      .from(t.evalSetRuns)
      .where(
        and(
          eq(t.evalSetRuns.workspaceId, workspaceId),
          opts.agentIds ? inArray(t.evalSetRuns.agentId, opts.agentIds) : undefined,
        ),
      )
      .orderBy(desc(runSortKey), desc(t.evalSetRuns.id));
    const rows = await (opts.limit === undefined ? query : query.limit(opts.limit));
    return rows.map(summaryToRecord);
  }

  async listFinishedRunsPerAgent(
    workspaceId: string,
    agentIds: string[],
    perAgent: number,
  ): Promise<EvalSetRunRecord[]> {
    if (agentIds.length === 0) return [];
    const ranked = this.db
      .select({
        ...runSummaryColumns,
        rn: sql<number>`row_number() over (partition by ${t.evalSetRuns.agentId} order by ${t.evalSetRuns.startedAt} desc, ${t.evalSetRuns.id} desc)`.as(
          'rn',
        ),
      })
      .from(t.evalSetRuns)
      .where(
        and(
          eq(t.evalSetRuns.workspaceId, workspaceId),
          inArray(t.evalSetRuns.agentId, agentIds),
          inArray(t.evalSetRuns.status, ['done', 'partial']),
        ),
      )
      .as('ranked');
    const rows = await this.db
      .select()
      .from(ranked)
      .where(lte(ranked.rn, perAgent))
      .orderBy(desc(ranked.startedAt), desc(ranked.id));
    return rows.map(({ rn: _rn, ...r }) => summaryToRecord(r));
  }

  async listRecentRuns(workspaceId: string, limit: number): Promise<EvalRecentRunRecord[]> {
    const rows = await this.db
      .select({ ...runSummaryColumns, agentName: t.agents.name })
      .from(t.evalSetRuns)
      .innerJoin(
        t.agents,
        and(eq(t.agents.id, t.evalSetRuns.agentId), eq(t.agents.workspaceId, workspaceId)),
      )
      .where(eq(t.evalSetRuns.workspaceId, workspaceId))
      .orderBy(desc(runSortKey), desc(t.evalSetRuns.id))
      .limit(limit);
    return rows.map(({ agentName, ...r }) => ({ ...summaryToRecord(r), agentName }));
  }

  async failRunningRuns(reason: string): Promise<number> {
    const rows = await this.db
      .update(t.evalSetRuns)
      .set({ status: 'failed', finishedAt: new Date(), error: reason })
      .where(eq(t.evalSetRuns.status, 'running'))
      .returning({ id: t.evalSetRuns.id });
    return rows.length;
  }
}
