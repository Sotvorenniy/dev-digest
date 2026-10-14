import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type { ProjectContextRepositoryPort, ProjectContextRunPort } from '../src/modules/project-context/ports.js';
import { FsProjectDocs } from '../src/adapters/project-docs/fs-project-docs.js';
import { RunBus } from '../src/platform/sse.js';
import { RunLogger } from '../src/platform/run-logger.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { RunTrace } from '@devdigest/shared';

/**
 * SPEC-01 AC9, AC10, AC11, AC12, AC13, EC12, EC19, EC20, NFR5, NFR9 and the
 * `specs_read` half of AC15. Real ProjectContextService + real FsProjectDocs on
 * a tmp clone, an in-memory repository fake, and the executor driven through
 * its private runOneAgent (same pattern as prompt-log-executor.test.ts).
 */

const DOC_A = '# Architecture\nDOC-A-BODY-MARKER module api/ never imports db/.';
const DOC_B = '# Style\nDOC-B-BODY-MARKER prefer early returns.';
const DOC_S = '# Skill doc\nDOC-S-BODY-MARKER skill-only rule.';
const DIFF_RAW = 'diff --git a/api/x.ts b/api/x.ts\n--- a/api/x.ts\n+++ b/api/x.ts\n@@ -1 +1 @@\n+import db from "../db";';

type Attach = { agent: string[]; skills: Record<string, string[]> };

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pcx-'));
  for (const [rel, body] of [
    ['specs/a.md', DOC_A],
    ['docs/b.md', DOC_B],
    ['docs/s.md', DOC_S],
  ] as const) {
    await mkdir(join(tmp, rel, '..'), { recursive: true });
    await writeFile(join(tmp, rel), body);
  }
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function memoryRepo(attach: Attach): ProjectContextRepositoryPort {
  return {
    findRepo: async () => null,
    agentExists: async () => true,
    skillExists: async () => true,
    listPaths: async (kind, ownerId) => (kind === 'agent' ? attach.agent : (attach.skills[ownerId] ?? [])),
    replacePaths: async () => undefined,
    usedByAgents: async () => new Map(),
    skillPaths: async (ids) => new Map(ids.map((id) => [id, attach.skills[id] ?? []])),
  };
}

interface SetupOpts {
  attach?: Attach;
  port?: ProjectContextRunPort;
  skills?: { id: string; name: string; enabled: boolean }[];
  repoIntel?: boolean;
  llmFails?: boolean;
}

function setup(opts: SetupOpts = {}) {
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
  const repoIntelCalls: string[] = [];
  const container = {
    runBus,
    config: { promptLogVerbose: false },
    llm: async () => {
      if (opts.llmFails) throw new Error('no provider key');
      return llm;
    },
    repoIntel: {
      getCallerSignatures: async () => (repoIntelCalls.push('callers'), []),
      getRepoMap: async () => (repoIntelCalls.push('map'), null),
      getFileRank: async () => [],
    },
  };
  const saved: { status?: string; trace?: RunTrace } = {};
  const repo = {
    insertReview: async () => ({ id: 'rev-1' }),
    insertFindings: async () => [],
    markReviewed: async () => undefined,
    completeAgentRun: async (_id: string, r: { status: string }) => {
      saved.status = r.status;
    },
    saveRunTrace: async (_id: string, t: RunTrace) => {
      saved.trace = t;
    },
  };
  const skills = opts.skills ?? [];
  const agents = {
    linkedSkills: async () =>
      skills.map((s, i) => ({
        skill: { id: s.id, name: s.name, body: `body-${s.name}`, source: 'manual', enabled: s.enabled },
        order: i,
      })),
  };
  const service = new ProjectContextService({
    repo: memoryRepo(opts.attach ?? { agent: [], skills: {} }),
    docs: new FsProjectDocs({
      clonePathFor: () => tmp,
      roots: ['**/{specs,docs,insights}/**/*.md'],
      excludedDirs: ['node_modules', '.git'],
      maxVisitedFiles: 5_000,
    }),
  });
  const executor = new ReviewRunExecutor(
    container as never,
    repo as never,
    agents as never,
    {} as never,
    opts.port ?? service,
  );
  const agent = {
    id: 'agent-1',
    name: 'Arch',
    provider: 'openai',
    model: 'gpt-test',
    systemPrompt: 'SYSTEM',
    repoIntel: opts.repoIntel ?? true,
    ciFailOn: 'high',
    version: 1,
  };
  const pull = { id: 'pr-1', repoId: 'repo-1', number: 7, title: 'T', author: 'me', body: null, headSha: 'abc' };
  const repoRow = { id: 'repo-1', owner: 'o', name: 'n' };
  const diff = {
    raw: DIFF_RAW,
    files: [
      {
        path: 'api/x.ts',
        additions: 1,
        deletions: 0,
        hunks: [{ file: 'api/x.ts', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, newLineNumbers: [1] }],
      },
    ],
  };
  const run = async () => {
    const parentLog = new RunLogger(runBus, ['run-1'], logger, { prId: pull.id });
    let threw: unknown;
    try {
      await (executor as any).runOneAgent('ws', pull, repoRow, diff, agent, 'run-1', parentLog, undefined, 0, 'corr', logger);
    } catch (e) {
      threw = e;
    }
    return threw;
  };
  const userMessage = () => {
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    return req.messages.find((m) => m.role === 'user')!.content;
  };
  const system = () => {
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    return req.messages.find((m) => m.role === 'system')!.content;
  };
  const live = () => runBus.buffer('run-1').map((e) => e.msg);
  return { run, saved, llm, userMessage, system, live, lines, repoIntelCalls };
}

describe('project context in the review run', () => {
  it('injects one path-labelled block per included doc, in order, under ## Project context (AC9)', async () => {
    const t = setup({ attach: { agent: ['specs/a.md', 'docs/b.md'], skills: {} } });
    await t.run();
    const user = t.userMessage();
    expect(user).toContain('## Project context');
    expect(user.indexOf('source="specs/a.md"')).toBeGreaterThan(-1);
    expect(user.indexOf('source="specs/a.md"')).toBeLessThan(user.indexOf('source="docs/b.md"'));
    expect(user).toContain(DOC_A);
    expect(t.saved.status).toBe('done');
    const specs = t.saved.trace!.prompt_assembly.specs as string;
    expect(specs.match(/<untrusted source="/g)).toHaveLength(2);
    expect(specs).toContain('source="specs/a.md"');
    expect(specs).toContain('source="docs/b.md"');
    expect(t.saved.trace!.specs_read).toEqual(['specs/a.md', 'docs/b.md']);
  });

  it('never puts doc text in the system message (AC9)', async () => {
    const t = setup({ attach: { agent: ['specs/a.md'], skills: {} } });
    await t.run();
    expect(t.system()).not.toContain('DOC-A-BODY-MARKER');
    expect(t.system()).not.toContain('specs/a.md');
  });

  it('orders agent docs before enabled-skill docs and drops disabled skills (EC12)', async () => {
    const t = setup({
      attach: { agent: ['docs/b.md'], skills: { s1: ['docs/s.md'], s2: ['specs/a.md'] } },
      skills: [
        { id: 's1', name: 'enabled-skill', enabled: true },
        { id: 's2', name: 'disabled-skill', enabled: false },
      ],
    });
    await t.run();
    const entries = t.saved.trace!.project_context!;
    expect(entries.map((e) => [e.path, e.origin, e.skill_name, e.status])).toEqual([
      ['docs/b.md', 'agent', null, 'included'],
      ['docs/s.md', 'skill', 'enabled-skill', 'included'],
    ]);
    expect(t.saved.trace!.specs_read).toEqual(['docs/b.md', 'docs/s.md']);
    expect(t.userMessage()).not.toContain('source="specs/a.md"');
  });

  it('trace entries carry tokens = ceil(chars/4) and the exact text for included docs (AC13)', async () => {
    const t = setup({ attach: { agent: ['specs/a.md'], skills: {} } });
    await t.run();
    expect(t.saved.trace!.project_context).toEqual([
      {
        path: 'specs/a.md',
        origin: 'agent',
        skill_name: null,
        status: 'included',
        tokens: Math.ceil(DOC_A.length / 4),
        text: DOC_A,
      },
    ]);
  });

  it('a missing doc does not fail the run: status done, missing entry, absent from specs_read, one info line (AC10)', async () => {
    const t = setup({ attach: { agent: ['specs/a.md', 'specs/gone.md'], skills: {} } });
    const threw = await t.run();
    expect(threw).toBeUndefined();
    expect(t.saved.status).toBe('done');
    const entries = t.saved.trace!.project_context!;
    expect(entries.find((e) => e.path === 'specs/gone.md')).toMatchObject({
      status: 'missing',
      tokens: null,
      text: null,
    });
    expect(t.saved.trace!.specs_read).toEqual(['specs/a.md']);
    expect(t.live().filter((m) => m === 'project context: skipped specs/gone.md (missing)')).toHaveLength(1);
    expect(t.live().filter((m) => m.startsWith('project context: 1 included, 1 skipped'))).toHaveLength(1);
    expect(t.userMessage()).not.toContain('specs/gone.md');
  });

  it('rejected (traversal) and over_limit (too large) paths are reported, not injected (AC10, NFR2)', async () => {
    await writeFile(join(tmp, 'docs', 'huge.md'), 'x'.repeat(70_000));
    const t = setup({ attach: { agent: ['../../etc/passwd.md', 'docs/huge.md', 'docs/b.md'], skills: {} } });
    await t.run();
    expect(t.saved.status).toBe('done');
    expect(t.saved.trace!.project_context!.map((e) => [e.path, e.status])).toEqual([
      ['../../etc/passwd.md', 'rejected'],
      ['docs/huge.md', 'over_limit'],
      ['docs/b.md', 'included'],
    ]);
    expect(t.saved.trace!.specs_read).toEqual(['docs/b.md']);
  });

  it('the run token cap skips the crossing doc and keeps going (AC11)', async () => {
    // Each doc is under the 64 KB per-doc cap (~15,750 tokens); two together cross the 24,000 run cap.
    for (const n of ['p1', 'p2']) await writeFile(join(tmp, 'docs', `${n}.md`), 'x'.repeat(63_000));
    const t = setup({ attach: { agent: ['docs/p1.md', 'docs/p2.md', 'docs/b.md'], skills: {} } });
    await t.run();
    expect(t.saved.trace!.project_context!.map((e) => [e.path, e.status])).toEqual([
      ['docs/p1.md', 'included'],
      ['docs/p2.md', 'over_limit'],
      ['docs/b.md', 'included'],
    ]);
  });

  it('with no attachments the prompt is identical to the no-context baseline and the trace is unchanged (AC12)', async () => {
    const baseline = setup({
      port: { resolveForRun: async () => ({ specs: [], entries: [], specsRead: [], includedTokens: 0 }) },
    });
    await baseline.run();
    const t = setup({ attach: { agent: [], skills: {} } });
    await t.run();
    expect(t.userMessage()).toBe(baseline.userMessage());
    expect(t.system()).toBe(baseline.system());
    expect(t.userMessage()).not.toContain('## Project context');
    expect(t.saved.trace!.prompt_assembly.specs ?? null).toBeNull();
    expect(t.saved.trace!.specs_read).toEqual([]);
    expect(t.saved.trace!.project_context ?? null).toBeNull();
    expect(t.live().some((m) => m.startsWith('project context:'))).toBe(false);
  });

  it('makes the same number of LLM calls with and without attached docs (NFR5)', async () => {
    const without = setup();
    await without.run();
    const withDocs = setup({ attach: { agent: ['specs/a.md', 'docs/b.md'], skills: {} } });
    await withDocs.run();
    expect(withDocs.llm.calls.length).toBe(without.llm.calls.length);
    expect(withDocs.llm.calls.length).toBeGreaterThan(0);
  });

  it('an agent with repoIntel: false still gets its attached docs and skips repo-intel (EC19)', async () => {
    const t = setup({ repoIntel: false, attach: { agent: ['specs/a.md'], skills: {} } });
    await t.run();
    expect(t.userMessage()).toContain('source="specs/a.md"');
    expect(t.repoIntelCalls).toEqual([]);
  });

  it('keeps doc text out of the pino events and the Live Log; metadata only (NFR9)', async () => {
    const t = setup({ attach: { agent: ['specs/a.md', 'specs/gone.md'], skills: {} } });
    await t.run();
    const pino = JSON.stringify(t.lines);
    const live = t.live().join('\n');
    for (const marker of ['DOC-A-BODY-MARKER', 'module api/ never imports']) {
      expect(pino).not.toContain(marker);
      expect(live).not.toContain(marker);
    }
    const ev = t.lines.find((l) => l.obj?.event === 'prompt.assembled');
    expect(ev!.obj.project_context_docs).toEqual({ included: 1, skipped: 1 });
    expect(JSON.stringify(t.saved.trace!.log)).not.toContain('DOC-A-BODY-MARKER');
    // The trace itself may hold the text (AC13).
    expect(JSON.stringify(t.saved.trace!.project_context)).toContain('DOC-A-BODY-MARKER');
  });

  it('a port that throws never fails the run: no context, one metadata-only info line', async () => {
    const t = setup({
      port: {
        resolveForRun: async () => {
          throw new Error('boom /secret/path');
        },
      },
    });
    const threw = await t.run();
    expect(threw).toBeUndefined();
    expect(t.saved.status).toBe('done');
    expect(t.userMessage()).not.toContain('## Project context');
    expect(t.live()).toContain('project context: unavailable — continuing without it');
    expect(t.live().join('\n')).not.toContain('boom');
  });

  it('a failure before the prompt keeps specs_read [] and no project_context (EC20)', async () => {
    const t = setup({ llmFails: true, attach: { agent: ['specs/a.md'], skills: {} } });
    const threw = await t.run();
    expect(threw).toBeInstanceOf(Error);
    expect(t.saved.status).toBe('failed');
    expect(t.saved.trace!.specs_read).toEqual([]);
    expect(t.saved.trace!.project_context).toBeUndefined();
  });
});
