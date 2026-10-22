/**
 * SPEC-06 EvalService with hand-written fakes for every port: one model call per case, scoring
 * without a model, per-case error isolation, snapshot semantics, log hygiene and the
 * case-creation rules. Hermetic (no Docker, no pg.ts).
 */
import { describe, it, expect } from 'vitest';
import type { LLMProvider } from '@devdigest/shared';
import { EvalService } from '../src/modules/eval/service.js';
import { parseCaseDiff } from '../src/modules/eval/repository.js';
import { evalTaskLine } from '../src/modules/eval/domain.js';
import type {
  CompleteEvalRun,
  EvalAgent,
  EvalCaseRecord,
  EvalFindingSource,
  EvalRecentRunRecord,
  EvalRepositoryPort,
  EvalSetRunRecord,
} from '../src/modules/eval/ports.js';

const PATCH = '@@ -8,3 +8,4 @@\n a\n b\n+c\n d';
const SECRET_TITLE = 'SECRET-PR-TITLE-XYZ';
const SECRET_PROMPT = 'SECRET-SYSTEM-PROMPT-QQQ';
const FINDING_TITLE = 'SECRET-FINDING-TITLE-ZZZ';

const meta = { pr_number: 7, title: SECRET_TITLE, body: 'body text' };
const expected = (type: 'must_find' | 'must_not_flag' = 'must_find') => ({
  type,
  items: [{ file: 'src/a.ts', start_line: 10, end_line: 10, title: 't', severity: 'CRITICAL' as const, category: 'security' as const }],
});

const caseRec = (id: string, type: 'must_find' | 'must_not_flag' = 'must_find'): EvalCaseRecord => ({
  id,
  workspaceId: 'w1',
  ownerId: 'a1',
  name: `case-${id}`,
  inputDiff: PATCH,
  inputFiles: ['src/a.ts'],
  inputMeta: meta,
  expected: expected(type),
  sourceFindingId: `f-${id}`,
  notes: null,
  sourceDecision: null,
});

const AGENT: EvalAgent = {
  id: 'a1',
  name: 'Agent One',
  version: 3,
  provider: 'openrouter',
  model: 'm/x',
  strategy: 'single-pass',
  systemPrompt: SECRET_PROMPT,
};

const FINDING = {
  id: 'x',
  severity: 'CRITICAL',
  category: 'security',
  title: FINDING_TITLE,
  file: 'src/a.ts',
  start_line: 10,
  end_line: 10,
  rationale: 'r',
  confidence: 0.9,
};

interface Opts {
  cases?: EvalCaseRecord[];
  /** index (0-based call number) → behaviour */
  failCall?: (n: number) => 'throw' | 'hang' | undefined;
  /** Throw on every call after this many calls. */
  throwAfter?: number;
  configured?: boolean;
  running?: boolean;
  source?: Partial<EvalFindingSource> | null;
  existingCase?: EvalCaseRecord;
  agents?: EvalAgent[];
  llmFactoryThrows?: boolean;
  timeoutMs?: number;
  /** Seeded run rows served by the dashboard reads (any status, any order). */
  seedRuns?: EvalSetRunRecord[];
  /** Agents-with-cases served by `listAgentsWithCases`. */
  casesAgents?: { agentId: string; name: string; model: string; casesTotal: number }[];
}

function setup(o: Opts = {}) {
  let cases = o.cases ?? [caseRec('c1'), caseRec('c2')];
  const runs = new Map<string, EvalSetRunRecord>();
  const completed: CompleteEvalRun[] = [];
  const logs: { level: string; obj: unknown; msg?: string }[] = [];
  const llmState = { calls: 0, requests: [] as Record<string, unknown>[] };
  const inserted: unknown[] = [];
  const dashCalls = {
    perAgent: [] as { agentIds: string[]; perAgent: number }[],
    summaries: [] as { agentIds?: string[]; limit?: number }[],
    recent: [] as number[],
  };
  const sortKey = (r: EvalSetRunRecord) => (r.finishedAt ?? r.startedAt).getTime();
  const newestFirst = (a: EvalSetRunRecord, b: EvalSetRunRecord) => sortKey(b) - sortKey(a);

  const repo: EvalRepositoryPort = {
    findFindingSource: async () =>
      o.source === null
        ? undefined
        : {
            findingId: 'f1',
            file: 'src/a.ts',
            startLine: 10,
            endLine: 12,
            title: 'Some Title',
            severity: 'CRITICAL',
            category: 'security',
            acceptedAt: new Date(),
            dismissedAt: null,
            reviewAgentId: 'a1',
            prNumber: 7,
            prTitle: 'T',
            prBody: null,
            filePatch: PATCH,
            ...o.source,
          },
    findCaseBySourceFinding: async () => o.existingCase,
    insertCase: async (v) => {
      inserted.push(v);
      return { record: { ...caseRec('new'), ownerId: v.ownerId, name: v.name, expected: v.expected }, created: true };
    },
    listCases: async () => cases,
    updateCase: async (_w, id, patch) => {
      const found = cases.find((c) => c.id === id);
      if (!found) return undefined;
      const next = { ...found, name: patch.name, inputDiff: patch.inputDiff, inputFiles: patch.inputFiles, inputMeta: patch.inputMeta, expected: patch.expected };
      cases = cases.map((c) => (c.id === id ? next : c));
      return next;
    },
    deleteCase: async (_w, id) => {
      const before = cases.length;
      cases = cases.filter((c) => c.id !== id);
      return cases.length < before;
    },
    countCases: async () => cases.length,
    startRun: async (v) => {
      const rec: EvalSetRunRecord = {
        id: `run-${runs.size + 1}`,
        workspaceId: v.workspaceId,
        agentId: v.agentId,
        agentVersion: v.agentVersion,
        provider: v.provider,
        model: v.model,
        strategy: v.strategy,
        systemPrompt: v.systemPrompt,
        status: 'running',
        error: null,
        startedAt: new Date(1000),
        finishedAt: null,
        casesTotal: v.caseSet.length,
        casesPassed: 0,
        casesErrored: 0,
        recall: null,
        precision: null,
        citationAccuracy: null,
        costUsd: null,
        durationMs: null,
        results: [],
      };
      runs.set(rec.id, rec);
      return rec;
    },
    hasRunningRun: async () => o.running ?? false,
    completeRun: async (id, patch) => {
      completed.push(patch);
      const r = runs.get(id)!;
      runs.set(id, { ...r, ...patch, error: patch.error ?? null, status: patch.status, finishedAt: new Date(2000) } as EvalSetRunRecord);
    },
    getRun: async (_w, id) => runs.get(id),
    listRuns: async () => [...runs.values()],
    latestCaseStatuses: async () => new Map([['c1', 'pass' as const]]),
    failRunningRuns: async () => 2,
    listAgentsWithCases: async () => o.casesAgents ?? [],
    listRunSummaries: async (_w, opts) => {
      dashCalls.summaries.push({ agentIds: opts?.agentIds, limit: opts?.limit });
      const rows = (o.seedRuns ?? [])
        .filter((r) => !opts?.agentIds || opts.agentIds.includes(r.agentId))
        .sort(newestFirst);
      return opts?.limit === undefined ? rows : rows.slice(0, opts.limit);
    },
    listFinishedRunsPerAgent: async (_w, agentIds, perAgent) => {
      dashCalls.perAgent.push({ agentIds, perAgent });
      const out: EvalSetRunRecord[] = [];
      for (const id of agentIds) {
        out.push(
          ...(o.seedRuns ?? [])
            .filter((r) => r.agentId === id && (r.status === 'done' || r.status === 'partial'))
            .sort(newestFirst)
            .slice(0, perAgent),
        );
      }
      return out.sort(newestFirst);
    },
    listRecentRuns: async (_w, limit) => {
      dashCalls.recent.push(limit);
      const names = new Map((o.casesAgents ?? []).map((a) => [a.agentId, a.name]));
      return [...(o.seedRuns ?? [])]
        .sort(newestFirst)
        .slice(0, limit)
        .map((r): EvalRecentRunRecord => ({ ...r, agentName: names.get(r.agentId) ?? 'unknown' }));
    },
  };

  const provider = {
    id: 'openrouter',
    completeStructured: async (req: Record<string, unknown>) => {
      const n = llmState.calls++;
      llmState.requests.push(req);
      if (o.throwAfter !== undefined && n >= o.throwAfter) throw new Error('control: provider called during scoring');
      const mode = o.failCall?.(n);
      if (mode === 'throw') throw new Error('502 upstream\nline two');
      if (mode === 'hang') await new Promise(() => {});
      return {
        data: { verdict: 'comment', summary: 's', score: 70, findings: [FINDING] },
        raw: '',
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.01,
        model: 'm/x',
      };
    },
  } as unknown as LLMProvider;

  const agents = o.agents ?? [AGENT];
  const svc = new EvalService({
    repo,
    agents: { getAgent: async (_w, id) => agents.find((a) => a.id === id) },
    llm: async () => {
      if (o.llmFactoryThrows) throw new Error('factory boom');
      return provider;
    },
    providerConfigured: async () => o.configured ?? true,
    parseDiff: parseCaseDiff,
    now: () => new Date(4000),
    ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
  });
  const logger = {
    info: (obj: unknown, msg?: string) => logs.push({ level: 'info', obj, msg }),
    warn: (obj: unknown, msg?: string) => logs.push({ level: 'warn', obj, msg }),
  };
  return {
    svc,
    logger,
    logs,
    llmState,
    completed,
    runs,
    inserted,
    dashCalls,
    removeCase: (id: string) => {
      cases = cases.filter((c) => c.id !== id);
    },
  };
}

describe('EvalService.startRun / execute', () => {
  it('returns running with the snapshot fields, makes one model call per case and scores in code', async () => {
    const s = setup();
    const run = await s.svc.startRun('w1', 'a1', { logger: s.logger });
    expect(run.status).toBe('running');
    expect(run.agent_version).toBe(3);
    expect(run.model).toBe('m/x');
    expect(run.strategy).toBe('single-pass');
    await s.svc.waitFor(run.id);

    expect(s.llmState.calls).toBe(2);
    const detail = await s.svc.getRun('w1', run.id);
    expect(detail.status).toBe('done');
    expect(detail.cases_total).toBe(2);
    expect(detail.cases_passed).toBe(2);
    expect(detail.recall).toBe(1);
    expect(detail.precision).toBe(1);
    expect(detail.cost_usd).toBeCloseTo(0.02);
    expect(detail.system_prompt).toBe(SECRET_PROMPT);
    expect(detail.results.map((r) => r.status)).toEqual(['pass', 'pass']);
  });

  it('scores without calling the provider: calls equal cases even if it throws after the last case', async () => {
    const s = setup({ throwAfter: 2 });
    const run = await s.svc.startRun('w1', 'a1', { logger: s.logger });
    await s.svc.waitFor(run.id);
    expect(s.llmState.calls).toBe(2);
    expect((await s.svc.getRun('w1', run.id)).status).toBe('done');
  });

  it('puts the PR title in the description section, not the task line', async () => {
    const s = setup({ cases: [caseRec('c1')] });
    const run = await s.svc.startRun('w1', 'a1', { logger: s.logger });
    await s.svc.waitFor(run.id);
    const text = JSON.stringify(s.llmState.requests[0]!.messages);
    const task = evalTaskLine(meta);
    expect(task).not.toContain(SECRET_TITLE);
    expect(text).toContain(JSON.stringify(task).slice(1, -1));
    expect(text).toContain(SECRET_TITLE);
    expect(text).toContain(SECRET_PROMPT);
  });

  it('marks a throwing case as error (flattened text), others still scored, run partial', async () => {
    const s = setup({ failCall: (n) => (n === 0 ? 'throw' : undefined) });
    const run = await s.svc.startRun('w1', 'a1', { logger: s.logger });
    await s.svc.waitFor(run.id);
    const d = await s.svc.getRun('w1', run.id);
    expect(d.status).toBe('partial');
    expect(d.cases_errored).toBe(1);
    expect(d.results[0]).toMatchObject({ status: 'error', error: '502 upstream line two' });
    expect(d.results[1]!.status).toBe('pass');
    expect(d.recall).toBe(1);
  });

  it('marks a hung case as error with fixed timeout text', async () => {
    const s = setup({ cases: [caseRec('c1'), caseRec('c2')], failCall: (n) => (n === 0 ? 'hang' : undefined), timeoutMs: 20 });
    const run = await s.svc.startRun('w1', 'a1', { logger: s.logger });
    await s.svc.waitFor(run.id);
    const d = await s.svc.getRun('w1', run.id);
    expect(d.status).toBe('partial');
    expect(d.results[0]).toMatchObject({ status: 'error', error: 'Case timed out' });
  });

  it('is failed with null metrics when every case throws', async () => {
    const s = setup({ failCall: () => 'throw' });
    const run = await s.svc.startRun('w1', 'a1', { logger: s.logger });
    await s.svc.waitFor(run.id);
    const d = await s.svc.getRun('w1', run.id);
    expect(d.status).toBe('failed');
    expect(d.cases_errored).toBe(2);
    expect(d.recall).toBeNull();
    expect(d.precision).toBeNull();
  });

  it('never leaves a run running when the provider factory itself throws', async () => {
    const s = setup({ llmFactoryThrows: true });
    const run = await s.svc.startRun('w1', 'a1', { logger: s.logger });
    await s.svc.waitFor(run.id);
    const d = await s.svc.getRun('w1', run.id);
    expect(d.status).toBe('failed');
    expect(s.logs.some((l) => l.msg === 'eval.run.failed')).toBe(true);
  });

  it('still scores a case removed from the repo after startRun (snapshot)', async () => {
    const s = setup();
    const run = await s.svc.startRun('w1', 'a1', { logger: s.logger });
    s.removeCase('c2');
    await s.svc.waitFor(run.id);
    const d = await s.svc.getRun('w1', run.id);
    expect(d.cases_total).toBe(2);
    expect(d.results.map((r) => r.case_id)).toEqual(['c1', 'c2']);
    expect(s.llmState.calls).toBe(2);
  });

  it('logs ids, counts and status only (no diff, prompt, PR text or finding titles)', async () => {
    const s = setup({ failCall: (n) => (n === 1 ? 'throw' : undefined) });
    const run = await s.svc.startRun('w1', 'a1', { logger: s.logger });
    await s.svc.waitFor(run.id);
    const dump = JSON.stringify(s.logs);
    expect(s.logs.length).toBeGreaterThan(0);
    for (const secret of [SECRET_PROMPT, SECRET_TITLE, FINDING_TITLE, '+c', '502 upstream', 'body text']) {
      expect(dump).not.toContain(secret);
    }
  });

  it('rejects with the right domain errors and starts nothing', async () => {
    const active = setup({ running: true });
    await expect(active.svc.startRun('w1', 'a1', { logger: active.logger })).rejects.toMatchObject({ code: 'eval_run_active', statusCode: 409 });
    const empty = setup({ cases: [] });
    await expect(empty.svc.startRun('w1', 'a1', { logger: empty.logger })).rejects.toMatchObject({ code: 'no_eval_cases', statusCode: 422 });
    const noKey = setup({ configured: false });
    await expect(noKey.svc.startRun('w1', 'a1', { logger: noKey.logger })).rejects.toMatchObject({ code: 'provider_not_configured', statusCode: 422 });
    const noAgent = setup();
    await expect(noAgent.svc.startRun('w1', 'nope', { logger: noAgent.logger })).rejects.toMatchObject({ statusCode: 404 });
    for (const s of [active, empty, noKey, noAgent]) {
      expect(s.runs.size).toBe(0);
      expect(s.llmState.calls).toBe(0);
    }
  });
});

describe('EvalService cases and reads', () => {
  it('listCases merges last status, defaulting to never_run', async () => {
    const s = setup();
    const list = await s.svc.listCases('w1', 'a1');
    expect(list.map((c) => c.last_status)).toEqual(['pass', 'never_run']);
  });

  it('deleteCase 404s for an unknown id', async () => {
    const s = setup();
    await s.svc.deleteCase('w1', 'c1');
    await expect(s.svc.deleteCase('w1', 'c1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('failStaleRuns returns the reaped count', async () => {
    expect(await setup().svc.failStaleRuns()).toBe(2);
  });

  it('getRun 404s for an unknown run', async () => {
    await expect(setup().svc.getRun('w1', 'nope')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('EvalService.createCaseFromFinding', () => {
  const opts = (s: ReturnType<typeof setup>) => ({ logger: s.logger });

  it('accepted finding becomes must_find owned by the review agent, with the stored patch', async () => {
    const s = setup();
    const { evalCase, created } = await s.svc.createCaseFromFinding('w1', 'f1', undefined, opts(s));
    expect(created).toBe(true);
    expect(evalCase.expected_output.type).toBe('must_find');
    expect(evalCase.owner_id).toBe('a1');
    expect(s.inserted[0]).toMatchObject({ inputDiff: PATCH, inputFiles: ['src/a.ts'], sourceFindingId: 'f1' });
  });

  it('dismissed finding becomes must_not_flag', async () => {
    const s = setup({ source: { acceptedAt: null, dismissedAt: new Date() } });
    const { evalCase } = await s.svc.createCaseFromFinding('w1', 'f1', undefined, opts(s));
    expect(evalCase.expected_output.type).toBe('must_not_flag');
  });

  it('undecided finding is rejected and nothing is inserted', async () => {
    const s = setup({ source: { acceptedAt: null, dismissedAt: null } });
    await expect(s.svc.createCaseFromFinding('w1', 'f1', undefined, opts(s))).rejects.toMatchObject({ code: 'finding_undecided', statusCode: 422 });
    expect(s.inserted).toHaveLength(0);
  });

  it('an existing case answers created:false even if the decision was since removed', async () => {
    const s = setup({ existingCase: caseRec('old'), source: { acceptedAt: null, dismissedAt: null } });
    const r = await s.svc.createCaseFromFinding('w1', 'f1', undefined, opts(s));
    expect(r.created).toBe(false);
    expect(r.evalCase.id).toBe('old');
    expect(s.inserted).toHaveLength(0);
  });

  it('a review with no agent needs agent_id, then uses the picked agent', async () => {
    const s = setup({ source: { reviewAgentId: null } });
    await expect(s.svc.createCaseFromFinding('w1', 'f1', undefined, opts(s))).rejects.toMatchObject({ code: 'agent_required', statusCode: 422 });
    const { evalCase } = await s.svc.createCaseFromFinding('w1', 'f1', { agent_id: 'a1' }, opts(s));
    expect(evalCase.owner_id).toBe('a1');
    await expect(
      s.svc.createCaseFromFinding('w1', 'f1', { agent_id: '00000000-0000-4000-8000-000000000000' }, opts(s)),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('a missing patch is diff_unavailable', async () => {
    const s = setup({ source: { filePatch: null } });
    await expect(s.svc.createCaseFromFinding('w1', 'f1', undefined, opts(s))).rejects.toMatchObject({ code: 'diff_unavailable', statusCode: 422 });
    expect(s.inserted).toHaveLength(0);
  });

  it('an unknown finding is 404', async () => {
    const s = setup({ source: null });
    await expect(s.svc.createCaseFromFinding('w1', 'f1', undefined, opts(s))).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---- dashboards (read-only) --------------------------------------------------

const T0 = Date.UTC(2026, 9, 1);
let runSeq = 0;
/** A stored run summary; `at` is minutes after T0 and is the finish time (start 1 min earlier). */
const runRec = (agentId: string, at: number, over: Partial<EvalSetRunRecord> = {}): EvalSetRunRecord => ({
  id: `r${++runSeq}`,
  workspaceId: 'w1',
  agentId,
  agentVersion: 2,
  provider: 'openrouter',
  model: 'm/x',
  strategy: 'single-pass',
  systemPrompt: SECRET_PROMPT,
  status: 'done',
  error: null,
  startedAt: new Date(T0 + (at - 1) * 60_000),
  finishedAt: new Date(T0 + at * 60_000),
  casesTotal: 4,
  casesPassed: 3,
  casesErrored: 0,
  recall: 0.5,
  precision: 0.6,
  citationAccuracy: 0.7,
  costUsd: 0.01,
  durationMs: 1000,
  results: [],
  ...over,
});

const CA = { agentId: 'a1', name: 'Agent One', model: 'm/x', casesTotal: 4 };
const CB = { agentId: 'a2', name: 'Agent Two', model: 'm/y', casesTotal: 2 };

describe('EvalService.updateCase', () => {
  const fields = {
    name: 'renamed',
    input_diff: PATCH,
    input_files: ['src/a.ts'],
    input_meta: meta,
    expected_output: expected('must_not_flag'),
  };

  it('replaces the editable fields and keeps owner and the last run status', async () => {
    const s = setup();
    const updated = await s.svc.updateCase('w1', 'c1', fields);
    expect(updated).toMatchObject({ id: 'c1', name: 'renamed', owner_id: 'a1', expected_output: { type: 'must_not_flag' } });
    expect(updated.last_status).toBe('pass');
    expect((await s.svc.listCases('w1', 'a1')).find((c) => c.id === 'c1')?.name).toBe('renamed');
  });

  it('404s for an unknown case', async () => {
    const s = setup();
    await expect(s.svc.updateCase('w1', 'nope', fields)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('EvalService modal flow (draft, save with edits, run draft)', () => {
  const opts = (s: ReturnType<typeof setup>) => ({ logger: s.logger });
  const edited = {
    name: 'edited name',
    input_diff: PATCH,
    input_files: ['src/a.ts'],
    input_meta: meta,
    expected_output: expected('must_not_flag'),
  };

  it('draftFromFinding returns the prefilled fields and writes nothing', async () => {
    const s = setup();
    const draft = await s.svc.draftFromFinding('w1', 'f1', undefined);
    expect(draft).toMatchObject({
      agent_id: 'a1',
      source_finding_id: 'f1',
      input_diff: PATCH,
      input_files: ['src/a.ts'],
      expected_output: { type: 'must_find' },
    });
    expect(s.inserted).toHaveLength(0);
    expect(s.llmState.calls).toBe(0);
  });

  it('draftFromFinding rejects an undecided finding and needs an agent when the review has none', async () => {
    const undecided = setup({ source: { acceptedAt: null, dismissedAt: null } });
    await expect(undecided.svc.draftFromFinding('w1', 'f1', undefined)).rejects.toMatchObject({ code: 'finding_undecided' });
    const noAgent = setup({ source: { reviewAgentId: null } });
    await expect(noAgent.svc.draftFromFinding('w1', 'f1', undefined)).rejects.toMatchObject({ code: 'agent_required' });
  });

  it('saves the edited fields instead of the finding-built ones', async () => {
    const s = setup();
    await s.svc.createCaseFromFinding('w1', 'f1', { case: edited }, opts(s));
    expect(s.inserted[0]).toMatchObject({
      name: 'edited name',
      expected: { type: 'must_not_flag' },
      sourceFindingId: 'f1',
    });
  });

  it('runDraft scores one case with one model call and persists nothing', async () => {
    const s = setup();
    const result = await s.svc.runDraft('w1', 'a1', { ...edited, expected_output: expected('must_find') }, opts(s));
    expect(s.llmState.calls).toBe(1);
    expect(result).toMatchObject({ case_id: null, case_name: 'edited name', status: 'pass' });
    expect(s.inserted).toHaveLength(0);
    expect(s.completed).toHaveLength(0);
  });

  it('runDraft needs a configured provider and a known agent', async () => {
    const off = setup({ configured: false });
    await expect(off.svc.runDraft('w1', 'a1', edited, opts(off))).rejects.toMatchObject({ code: 'provider_not_configured' });
    expect(off.llmState.calls).toBe(0);
    const s = setup();
    await expect(s.svc.runDraft('w1', 'nope', edited, opts(s))).rejects.toMatchObject({ statusCode: 404 });
  });

  it('runDraft turns a failing model call into an error result, not a throw', async () => {
    const s = setup({ throwAfter: 0 });
    const result = await s.svc.runDraft('w1', 'a1', edited, opts(s));
    expect(result.status).toBe('error');
    expect(result.error).toBeTruthy();
  });
});

describe('EvalService.workspaceDashboard', () => {
  it('lists the agents the repo returns with cases_total and the stored latest run values', async () => {
    const s = setup({
      casesAgents: [CA, CB],
      seedRuns: [runRec('a1', 10, { recall: 0.9, precision: 0.8, citationAccuracy: 0.7, casesPassed: 3 })],
    });
    const d = await s.svc.workspaceDashboard('w1');
    expect(d.agents.map((a) => a.agent_id)).toEqual(['a1', 'a2']);
    expect(d.agents[0]).toMatchObject({
      name: 'Agent One',
      model: 'm/x',
      cases_total: 4,
      latest: { agent_id: 'a1', recall: 0.9, precision: 0.8, citation_accuracy: 0.7, cases_passed: 3, status: 'done' },
    });
    expect(d.agents[0]!.latest!.finished_at).toBe(new Date(T0 + 10 * 60_000).toISOString());
  });

  it('gives latest null and an empty series with no finished run, never treating failed/running as latest', async () => {
    const s = setup({
      casesAgents: [CA, CB],
      seedRuns: [
        runRec('a1', 20, { status: 'failed', recall: null }),
        runRec('a1', 21, { status: 'running', finishedAt: null, recall: null }),
        runRec('a2', 5, { recall: 0.4 }),
        runRec('a2', 30, { status: 'failed', recall: null }),
      ],
    });
    const d = await s.svc.workspaceDashboard('w1');
    const a1 = d.agents.find((a) => a.agent_id === 'a1')!;
    const a2 = d.agents.find((a) => a.agent_id === 'a2')!;
    expect(a1.latest).toBeNull();
    expect(a1.recall_series).toEqual([]);
    expect(a2.latest!.recall).toBe(0.4);
    expect(a2.recall_series).toEqual([0.4]);
  });

  it('asks the repo for 10 finished runs per agent; series is oldest first with null recalls dropped', async () => {
    const seed = Array.from({ length: 12 }, (_, i) => runRec('a1', i + 1, { recall: (i + 1) / 100 }));
    seed.push(runRec('a1', 6.5, { recall: null, status: 'partial' }));
    const s = setup({ casesAgents: [CA], seedRuns: seed });
    const d = await s.svc.workspaceDashboard('w1');
    expect(s.dashCalls.perAgent).toEqual([{ agentIds: ['a1'], perAgent: 10 }]);
    // 13 finished rows; the newest 10 are minutes 12..6, 6.5 (null, dropped), 5, 4
    expect(d.agents[0]!.recall_series).toEqual([0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12]);
  });

  it('returns recent_runs with agent_name in repo order, requesting 10, running rows included', async () => {
    const s = setup({
      casesAgents: [CA, CB],
      seedRuns: [
        runRec('a1', 1),
        runRec('a2', 3, { status: 'running', finishedAt: null, startedAt: new Date(T0 + 99 * 60_000) }),
        runRec('a1', 2),
      ],
    });
    const d = await s.svc.workspaceDashboard('w1');
    expect(s.dashCalls.recent).toEqual([10]);
    expect(d.recent_runs.map((r) => [r.agent_name, r.status])).toEqual([
      ['Agent Two', 'running'],
      ['Agent One', 'done'],
      ['Agent One', 'done'],
    ]);
  });

  it('never leaks system_prompt or results onto the wire', async () => {
    const s = setup({ casesAgents: [CA], seedRuns: [runRec('a1', 1)] });
    const text = JSON.stringify(await s.svc.workspaceDashboard('w1'));
    expect(text).not.toContain(SECRET_PROMPT);
    expect(text).not.toContain('system_prompt');
  });

  it('returns empty lists when no agent has cases', async () => {
    const s = setup({ casesAgents: [], seedRuns: [] });
    expect(await s.svc.workspaceDashboard('w1')).toEqual({ agents: [], recent_runs: [] });
  });
});

describe('EvalService.agentDashboard', () => {
  it('throws a 404 for an unknown agent', async () => {
    const s = setup();
    await expect(s.svc.agentDashboard('w1', 'nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('sets name, model, cases_total and picks latest/previous among finished runs only', async () => {
    const s = setup({
      cases: [caseRec('c1'), caseRec('c2'), caseRec('c3')],
      seedRuns: [
        runRec('a1', 1, { recall: 0.1 }),
        runRec('a1', 2, { recall: 0.2, status: 'partial' }),
        runRec('a1', 3, { status: 'failed', recall: null }),
        runRec('a1', 4, { status: 'running', finishedAt: null, recall: null }),
        runRec('a2', 9, { recall: 0.9 }),
      ],
    });
    const d = await s.svc.agentDashboard('w1', 'a1');
    expect(d).toMatchObject({ agent_id: 'a1', name: 'Agent One', model: 'm/x', cases_total: 3 });
    expect(d.latest!.recall).toBe(0.2);
    expect(d.latest!.status).toBe('partial');
    expect(d.previous!.recall).toBe(0.1);
    expect(s.dashCalls.perAgent).toEqual([{ agentIds: ['a1'], perAgent: 100 }]);
    expect(s.dashCalls.summaries).toEqual([{ agentIds: ['a1'], limit: 20 }]);
  });

  it('keeps latest/previous/trend when the newest runs are all failed or running but older finished runs exist', async () => {
    const seed = [
      runRec('a1', 1, { recall: 0.3 }),
      runRec('a1', 2, { recall: 0.6 }),
      ...Array.from({ length: 25 }, (_, i) => runRec('a1', 10 + i, { status: 'failed', recall: null })),
      runRec('a1', 99, { status: 'running', finishedAt: null, recall: null }),
    ];
    const s = setup({ seedRuns: seed });
    const d = await s.svc.agentDashboard('w1', 'a1');
    expect(d.latest!.recall).toBe(0.6);
    expect(d.previous!.recall).toBe(0.3);
    expect(d.trend.map((p) => p.recall)).toEqual([0.3, 0.6]);
    expect(d.runs).toHaveLength(20);
    expect(d.runs.every((r) => r.status === 'failed' || r.status === 'running')).toBe(true);
  });

  it('has trend chronological over finished runs only, and runs newest first capped at 20 (failed included)', async () => {
    const seed = Array.from({ length: 25 }, (_, i) => runRec('a1', i + 1, { recall: (i + 1) / 100 }));
    seed.push(runRec('a1', 40, { status: 'failed', recall: null }));
    const s = setup({ seedRuns: seed });
    const d = await s.svc.agentDashboard('w1', 'a1');
    expect(d.trend).toHaveLength(25);
    expect(d.trend.map((p) => p.recall)).toEqual(Array.from({ length: 25 }, (_, i) => (i + 1) / 100));
    expect(d.runs).toHaveLength(20);
    expect(d.runs[0]!.status).toBe('failed');
    expect(d.runs[1]!.recall).toBe(0.25);
  });

  it('gives null latest/previous and an empty trend with only failed runs; keeps null metrics in trend', async () => {
    const s = setup({ seedRuns: [runRec('a1', 1, { status: 'failed', recall: null })] });
    const d = await s.svc.agentDashboard('w1', 'a1');
    expect(d.latest).toBeNull();
    expect(d.previous).toBeNull();
    expect(d.trend).toEqual([]);
    expect(d.runs).toHaveLength(1);

    const s2 = setup({ seedRuns: [runRec('a1', 1, { recall: null, precision: null })] });
    const d2 = await s2.svc.agentDashboard('w1', 'a1');
    expect(d2.trend[0]).toMatchObject({ recall: null, precision: null, citation_accuracy: 0.7 });
    expect(d2.previous).toBeNull();
  });

  it('allows cases_total 0 with no runs', async () => {
    const s = setup({ cases: [] });
    const d = await s.svc.agentDashboard('w1', 'a1');
    expect(d).toMatchObject({ cases_total: 0, latest: null, previous: null, trend: [], runs: [] });
  });
});
