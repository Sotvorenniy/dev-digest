import { describe, it, expect, vi } from 'vitest';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { RunBus } from '../src/platform/sse.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * Hermetic coverage of the `prompt.assembled` emission in runOneAgent, driven
 * with fakes (no DB, no network). runOneAgent is private; it is invoked through
 * a cast because executeRuns needs diff loading from git/GitHub.
 */

const SECRET = 'sk-test-SECRET123';
const DIFF_RAW = `diff --git a/secret.ts b/secret.ts\n--- a/secret.ts\n+++ b/secret.ts\n@@ -1 +1 @@\n+const k = "${SECRET}";`;

function setup(opts: { verbose?: boolean } = {}) {
  const lines: { obj: any; msg?: string }[] = [];
  const logger = {
    info: (obj: unknown, msg?: string) => lines.push({ obj, msg }),
    warn: vi.fn(),
    error: (obj: unknown, msg?: string) => lines.push({ obj, msg }),
    debug: vi.fn(),
  };
  const runBus = new RunBus();
  const llm = new MockLLMProvider('openai', {
    structured: { verdict: 'approve', summary: 'ok', score: 95, findings: [] },
  });
  const container = {
    runBus,
    config: { promptLogVerbose: opts.verbose ?? false },
    llm: async () => llm,
    repoIntel: {
      getCallerSignatures: async () => [],
      getRepoMap: async () => null,
      getFileRank: async () => [],
    },
  };
  const repo = {
    insertReview: async () => ({ id: 'rev-1' }),
    insertFindings: async () => [],
    markReviewed: async () => undefined,
    completeAgentRun: async () => undefined,
    saveRunTrace: async () => undefined,
  };
  const agents = {
    linkedSkills: async () => [
      { skill: { name: 'sec-skill', body: 'SKILL-PRIVATE-BODY', source: 'manual', enabled: true } },
    ],
  };
  const executor = new ReviewRunExecutor(container as never, repo as never, agents as never, {} as never);
  const agent = { id: 'a1', name: 'Sec', provider: 'openai', model: 'gpt-test', systemPrompt: `SYSTEM ${SECRET}`, repoIntel: false, ciFailOn: 'high' };
  const pull = { id: 'pr-1', repoId: 'r1', number: 7, title: 'T', author: 'me', body: 'PRBODY-PRIVATE', headSha: 'abc' };
  const repoRow = { owner: 'o', name: 'n' };
  const diff = {
    raw: DIFF_RAW,
    files: [{ path: 'secret.ts', additions: 1, deletions: 0, hunks: [{ file: 'secret.ts', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, newLineNumbers: [1] }] }],
  };

  const run = async (correlationId?: string) => {
    const parentLog = new (await import('../src/platform/run-logger.js')).RunLogger(runBus, ['run-1'], logger, { prId: pull.id });
    await (executor as any).runOneAgent(
      'ws', pull, repoRow, diff, agent, 'run-1', parentLog, undefined, 0, correlationId, logger,
    );
  };
  const assembled = () => lines.filter((l) => l.obj?.event === 'prompt.assembled');
  return { run, lines, assembled, runBus };
}

describe('prompt.assembled emission', () => {
  it('logs one event with correlation_id, run_id, model and metadata-only sections', async () => {
    const t = setup();
    await t.run('corr-123');
    const ev = t.assembled();
    expect(ev).toHaveLength(1);
    const o = ev[0]!.obj;
    expect(o.correlation_id).toBe('corr-123');
    expect(o.run_id).toBe('run-1');
    expect(o.model).toBe('gpt-test');
    expect(o.pr_id).toBe('pr-1');
    expect(o.sections.map((s: any) => s.section)).toEqual(
      expect.arrayContaining(['system', 'skills', 'pr_description', 'user']),
    );
    expect(o.diff).toEqual({ chars: DIFF_RAW.length, files: 1 });
    expect(o.sections[0].lines).toBeUndefined(); // normal mode
    // Fails if the event is dropped, loses an identifier, or verbose fields appear in normal mode.
  });

  it('never puts prompt text, the API key or diff paths into the pino event', async () => {
    const t = setup();
    await t.run('corr-1');
    const json = JSON.stringify(t.assembled()[0]!.obj);
    for (const needle of [SECRET, 'SKILL-PRIVATE-BODY', 'PRBODY-PRIVATE', '+++ b/secret.ts', 'secret.ts']) {
      expect(json).not.toContain(needle);
    }
    // Fails if the emit block spreads the assembly (or diff) into the log object.
  });

  it('adds verbose metadata (skills_used, hashes) only when config.promptLogVerbose is on', async () => {
    const t = setup({ verbose: true });
    await t.run('corr-1');
    const o = t.assembled()[0]!.obj;
    expect(o.skills_used).toEqual(['sec-skill']);
    expect(o.sections[0].sha256_12).toMatch(/^[0-9a-f]{12}$/);
    const json = JSON.stringify(o);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain('SKILL-PRIVATE-BODY');
    // Fails if the config flag is ignored or verbose mode starts leaking text.
  });

  it('streams exactly one summary Live Log line without prompt text', async () => {
    const t = setup();
    await t.run('corr-1');
    const live = t.runBus.buffer('run-1').filter((e) => e.msg.startsWith('Prompt assembled'));
    expect(live).toHaveLength(1);
    expect(live[0]!.msg).toMatch(/^Prompt assembled — \d+ section\(s\), \d+ chars \(~\d+ tokens\)$/);
    // Fails if the line is missing/duplicated or embeds section content.
  });

  it('falls back to a generated correlation id when none is supplied', async () => {
    const t = setup();
    await t.run(undefined);
    const id = t.assembled()[0]!.obj.correlation_id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    // Fails if the default is removed and the event logs correlation_id undefined.
  });
});
