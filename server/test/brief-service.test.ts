/**
 * SPEC-03 BriefService with fakes for every port: exactly one LLM call, failure reasons,
 * join of overlapping generations, bounded issue fetch, grounding and log hygiene. Hermetic.
 */
import { describe, it, expect, vi } from 'vitest';
import type { BlastRadius, LLMProvider, PrBrief } from '@devdigest/shared';
import { BriefService, type BriefServiceDeps } from '../src/modules/brief/service.js';
import type { BriefFileRow, BriefPull, BriefRepositoryPort } from '../src/modules/brief/ports.js';
import { ConfigError, NotFoundError } from '../src/platform/errors.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

const PATCH = '@@ -8,3 +8,4 @@\n a\n b\n+c\n d';
const DIFF = parseUnifiedDiff(
  ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', PATCH].join('\n'),
);
const SECRET_BODY = 'PR-BODY-SECRET-TEXT Closes #5';

const pull = (over: Partial<BriefPull> = {}): BriefPull => ({
  id: 'p1',
  repoId: 'r1',
  number: 7,
  title: 'Add limiter',
  body: SECRET_BODY,
  headSha: 'head1',
  repo: { owner: 'o', name: 'n' },
  ...over,
});
const FILES: BriefFileRow[] = [{ path: 'src/a.ts', additions: 3, deletions: 0, hunks: ['@@ -8,3 +8,4 @@'] }];
const MODEL_OUT = {
  summary: 'SUMMARY-TEXT',
  risks: [
    { kind: 'k', title: 'risk-title', explanation: 'e', severity: 'low', file_refs: ['src/a.ts:8-10', 'ghost.ts'] },
  ],
  review_focus: [
    { file: 'src/a.ts', line: 10, reason: 'ok' },
    { file: 'ghost.ts', line: 1, reason: 'bad' },
  ],
};

interface Opts {
  files?: BriefFileRow[];
  pull?: BriefPull | undefined;
  llmThrows?: unknown;
  config?: boolean;
  getIssue?: () => Promise<unknown>;
  blast?: () => Promise<BlastRadius>;
  intent?: () => Promise<unknown>;
  docPaths?: string[];
  limits?: BriefServiceDeps['limits'];
  llmGate?: Promise<void>;
}

function setup(o: Opts = {}) {
  const saved: PrBrief[] = [];
  const calls: Record<string, unknown>[] = [];
  const logs: { level: string; obj: Record<string, unknown> }[] = [];
  const stored: { value: PrBrief | null } = { value: null };
  const repo: BriefRepositoryPort = {
    findPull: async () => ('pull' in o ? o.pull : pull()),
    listFiles: async () => o.files ?? FILES,
    getDiff: async () => DIFF,
    listEnabledAgentDocPaths: async () => o.docPaths ?? [],
    getBrief: async () => stored.value,
    saveBrief: async (_id, b) => {
      saved.push(b);
      stored.value = b;
    },
  };
  const provider = {
    id: 'openrouter',
    completeStructured: async (req: Record<string, unknown>) => {
      calls.push(req);
      if (calls.length > 1 && !o.llmGate) throw new Error('control: second LLM call');
      if (o.llmGate) await o.llmGate;
      if (o.llmThrows) throw o.llmThrows;
      return { data: MODEL_OUT, raw: '', tokensIn: 100, tokensOut: 20, costUsd: 0.002, model: 'm/x' };
    },
  } as unknown as LLMProvider;
  const deps: BriefServiceDeps = {
    repo,
    intent: { getIntent: (o.intent ?? (async () => undefined)) as never },
    blast: {
      get:
        o.blast ??
        (async () => ({ changed_symbols: [], downstream: [], summary: 'blast-summary-text', degraded: false })),
    },
    issues: { getIssue: (o.getIssue ?? (async () => ({ number: 5, title: 'T', body: 'B' }))) as never },
    docs: { read: async () => ({ kind: 'ok', text: 'spec text', sizeBytes: 9, updatedAt: null }) },
    llm: async () => provider,
    resolveModel: async () => {
      if (o.config) throw new ConfigError('no key');
      return { provider: 'openrouter', model: 'brief/model' } as never;
    },
    systemPrompt: async () => 'SYS',
    now: () => new Date('2026-02-02T00:00:00.000Z'),
    limits: o.limits,
  };
  const logger = {
    info: (obj: unknown) => logs.push({ level: 'info', obj: obj as Record<string, unknown> }),
    warn: (obj: unknown) => logs.push({ level: 'warn', obj: obj as Record<string, unknown> }),
  };
  return { svc: new BriefService(deps), saved, calls, logs, logger, deps, stored };
}

describe('BriefService.generate', () => {
  it('AC2/AC4/NFR1: one completeStructured call with the brief model, no retries, 90 s, 5,000 tokens', async () => {
    const t = setup();
    const brief = await t.svc.generate('w', 'p1', { logger: t.logger });
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]).toMatchObject({
      model: 'brief/model',
      maxRetries: 0,
      timeoutMs: 90_000,
      maxTokens: 5000,
    });
    expect(t.saved).toEqual([brief]);
    expect(brief.head_sha).toBe('head1');
    expect(brief.generated_at).toBe('2026-02-02T00:00:00.000Z');
    expect(brief.tokens_in).toBe(100);
  });

  it('AC5: ungrounded refs and focus items are dropped and counted', async () => {
    const t = setup();
    const brief = await t.svc.generate('w', 'p1', { logger: t.logger });
    expect(brief.risks.risks[0]!.file_refs).toEqual(['src/a.ts:8-10']);
    expect(brief.review_focus).toEqual([{ file: 'src/a.ts', line: 10, reason: 'ok' }]);
    expect(brief.dropped).toEqual({ review_focus: 1, risks: 0, file_refs: 1 });
  });

  it('AC15: two overlapping generations join one run and one LLM call', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup({ llmGate: gate });
    const a = t.svc.generate('w', 'p1', { logger: t.logger });
    const b = t.svc.generate('w', 'p1', { logger: t.logger });
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(t.calls).toHaveLength(1);
    expect(rb).toBe(ra);
    expect(t.saved).toHaveLength(1);
  });

  it('AC15: after a run settles, the next generate starts a new run', async () => {
    const t = setup({ llmGate: Promise.resolve() });
    await t.svc.generate('w', 'p1', { logger: t.logger });
    await t.svc.generate('w', 'p1', { logger: t.logger });
    expect(t.calls).toHaveLength(2);
  });

  it('AC16: no changed files fails with no_files and zero LLM calls', async () => {
    const t = setup({ files: [] });
    await expect(t.svc.generate('w', 'p1', { logger: t.logger })).rejects.toMatchObject({
      details: { reason: 'no_files' },
    });
    expect(t.calls).toHaveLength(0);
    expect(t.saved).toHaveLength(0);
  });

  it('unknown PR is a NotFoundError and nothing runs', async () => {
    const t = setup({ pull: undefined });
    await expect(t.svc.generate('w', 'p1', { logger: t.logger })).rejects.toBeInstanceOf(NotFoundError);
    expect(t.calls).toHaveLength(0);
  });

  it.each([
    ['timeout', Object.assign(new Error('x'), { name: 'TimeoutError' })],
    ['schema_mismatch', new Error('OpenRouter structured output failed schema validation')],
    ['provider_error', new Error('502 bad gateway')],
  ])('AC13: a %s failure stores nothing and carries only { reason }', async (reason, err) => {
    const t = setup({ llmThrows: err });
    await expect(t.svc.generate('w', 'p1', { logger: t.logger })).rejects.toMatchObject({
      message: 'Brief generation failed',
      details: { reason },
    });
    expect(t.saved).toHaveLength(0);
  });

  it('AC13: a missing key rethrows ConfigError and never saves', async () => {
    const t = setup({ config: true });
    await expect(t.svc.generate('w', 'p1', { logger: t.logger })).rejects.toBeInstanceOf(ConfigError);
    expect(t.saved).toHaveLength(0);
    expect(t.calls).toHaveLength(0);
  });

  it('a model call that outlives limits.llmTimeoutMs fails as timeout', async () => {
    const t = setup({ llmGate: new Promise<void>(() => undefined), limits: { llmTimeoutMs: 20 } });
    await expect(t.svc.generate('w', 'p1', { logger: t.logger })).rejects.toMatchObject({
      details: { reason: 'timeout' },
    });
  });

  it('EC13: specs_used lists the attached spec read through the docs port', async () => {
    const t = setup({ docPaths: ['docs/spec.md', 'docs/spec.md'] });
    const brief = await t.svc.generate('w', 'p1', { logger: t.logger });
    expect(brief.specs_used).toEqual(['docs/spec.md']);
    expect(brief.missing_inputs).not.toContainEqual({ input: 'specs', reason: 'absent' });
  });

  it('F7e: a getIssue that never resolves is cut at issueTimeoutMs; the brief still generates', async () => {
    const t = setup({ getIssue: () => new Promise(() => undefined), limits: { issueTimeoutMs: 20 } });
    const brief = await t.svc.generate('w', 'p1', { logger: t.logger });
    expect(brief.missing_inputs).toContainEqual({ input: 'issue', reason: 'absent' });
    expect(t.calls).toHaveLength(1);
  });

  it('F7e: issue, blast and intent reads start concurrently (all started before any resolves)', async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const gated = <T>(name: string, v: T) => async () => {
      started.push(name);
      await gate;
      return v;
    };
    const t = setup({
      getIssue: gated('issue', { number: 5, title: 'T', body: 'B' }),
      blast: gated('blast', { changed_symbols: [], downstream: [], summary: 's' }),
      intent: gated('intent', undefined),
    });
    const run = t.svc.generate('w', 'p1', { logger: t.logger });
    await vi.waitFor(() => expect(started.sort()).toEqual(['blast', 'intent', 'issue']));
    expect(t.calls).toHaveLength(0); // nothing resolved yet, still gathering
    release();
    await run;
  });

  it('EC22: a PR with no issue reference reports the issue as absent', async () => {
    const getIssue = vi.fn();
    const t = setup({ pull: pull({ body: 'plain body' }), getIssue: getIssue as never });
    const brief = await t.svc.generate('w', 'p1', { logger: t.logger });
    expect(getIssue).not.toHaveBeenCalled();
    expect(brief.missing_inputs).toContainEqual({ input: 'issue', reason: 'absent' });
  });

  it('EC23: blast failing or degraded is recorded; failure still produces a brief with null blast', async () => {
    const failing = setup({ blast: async () => Promise.reject(new Error('index down')) });
    const b1 = await failing.svc.generate('w', 'p1', { logger: failing.logger });
    expect(b1.blast).toBeNull();
    expect(b1.missing_inputs).toContainEqual({ input: 'blast', reason: 'unavailable' });

    const degraded = setup({
      blast: async () => ({ changed_symbols: [], downstream: [], summary: 's', degraded: true }),
    });
    const b2 = await degraded.svc.generate('w', 'p1', { logger: degraded.logger });
    expect(b2.missing_inputs).toContainEqual({ input: 'blast', reason: 'degraded' });
  });

  it('a stale intent (different head_sha) is flagged stale', async () => {
    const t = setup({
      intent: async () => ({
        intent: 'i', in_scope: [], out_of_scope: [], change_type: 'feature', head_sha: 'older', inputs_hash: null,
      }),
    });
    const brief = await t.svc.generate('w', 'p1', { logger: t.logger });
    expect(brief.missing_inputs).toContainEqual({ input: 'intent', reason: 'stale' });
  });

  it('NFR6: exactly one record per success path, with no PR text, paths or summary', async () => {
    const t = setup();
    await t.svc.generate('w', 'p1', { logger: t.logger });
    expect(t.logs).toHaveLength(1);
    expect(t.logs[0]!.level).toBe('info');
    expect(t.logs[0]!.obj.event).toBe('brief.generated');
    const text = JSON.stringify(t.logs[0]!.obj);
    for (const leak of ['PR-BODY-SECRET-TEXT', 'src/a.ts', 'SUMMARY-TEXT', 'risk-title', 'blast-summary-text']) {
      expect(text).not.toContain(leak);
    }
  });

  it.each([
    ['llm failure', { llmThrows: new Error('boom') }, 'provider_error'],
    ['no files', { files: [] }, 'no_files'],
    ['config error', { config: true }, 'config_error'],
  ])('NFR6: %s writes exactly one warn with the reason', async (_n, opts, reason) => {
    const t = setup(opts as Opts);
    await t.svc.generate('w', 'p1', { logger: t.logger }).catch(() => undefined);
    expect(t.logs).toHaveLength(1);
    expect(t.logs[0]!.level).toBe('warn');
    expect(t.logs[0]!.obj).toMatchObject({ event: 'brief.failed', reason });
    expect(JSON.stringify(t.logs[0]!.obj)).not.toContain('PR-BODY-SECRET-TEXT');
  });
});

describe('BriefService.get', () => {
  it('returns the stored brief, 404s when none and never calls the model', async () => {
    const t = setup();
    await expect(t.svc.get('w', 'p1')).rejects.toBeInstanceOf(NotFoundError);
    const brief = await t.svc.generate('w', 'p1', { logger: t.logger });
    expect(await t.svc.get('w', 'p1')).toEqual(brief);
    expect(t.calls).toHaveLength(1);
  });
});
