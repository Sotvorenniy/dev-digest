import { describe, it, expect } from 'vitest';
import { IntentService } from '../src/modules/intent/service.js';
import { extractHunkHeaders } from '../src/modules/intent/domain.js';
import type { IntentRepositoryPort, IntentWrite } from '../src/modules/intent/ports.js';

const PATCH = '@@ -1,2 +1,3 @@ fn()\n+const TOKEN = "sk-live-SHOULD-NOT-LEAK";\n';

function setup(opts: { body: string; docFails?: boolean }) {
  let saved: IntentWrite | undefined;
  const calls: { model: string; messages: { role: string; content: string }[] }[] = [];
  const logs: Record<string, unknown>[] = [];
  const repo: IntentRepositoryPort = {
    getPull: async () => ({ id: 'p1', repoId: 'r1', number: 7, title: 'Add limiter', author: 'a', branch: 'feat/x', headSha: 'abc', body: opts.body }),
    getRepo: async () => ({ owner: 'o', name: 'r' }),
    listCommitSubjects: async () => ['feat: limiter'],
    listFiles: async () => [{ path: 'src/limit.ts', hunks: extractHunkHeaders(PATCH) }],
    getIntent: async () =>
      saved && ({
        pr_id: 'p1', intent: saved.intent, in_scope: saved.inScope, out_of_scope: saved.outOfScope,
        change_type: saved.changeType, confidence: saved.confidence, basis: saved.basis,
        sources: saved.sources, requirements: saved.requirements, provider: saved.provider,
        model: saved.model, head_sha: saved.headSha, inputs_hash: saved.inputsHash,
      } as never),
    upsertIntent: async (v) => { saved = v; },
  };
  const svc = new IntentService({
    repo,
    github: async () => { throw new Error('no token'); },
    git: { readFile: async () => { throw new Error('missing'); } },
    docs: { fetch: async () => { throw new Error('nope'); } },
    llm: async () => ({
      completeStructured: async (req: { model: string; messages: { role: string; content: string }[] }) => {
        calls.push({ model: req.model, messages: req.messages });
        return {
          data: { intent: 'Adds a limiter', in_scope: ['limiter'], out_of_scope: [], change_type: 'feature', confidence: 0.9, basis: 'documented', used_source_ids: ['description-1'] },
          raw: '', tokensIn: 100, tokensOut: 20, costUsd: 0.0001,
        };
      },
    }) as never,
    resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }) as never,
  });
  const logger = { info: (o: unknown) => logs.push(o as Record<string, unknown>), warn: () => undefined };
  return { svc, calls, logs, logger, saved: () => saved };
}

describe('IntentService.derive', () => {
  it('uses the dedicated intent model and sends hunk headers, never change bodies', async () => {
    const t = setup({ body: 'Rate limit the API. Spec: docs/specs/limit.md' });
    await t.svc.derive('w', 'p1', { logger: t.logger, correlationId: 'c1' });
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.model).toBe('deepseek/deepseek-v4-flash');
    const all = t.calls[0]!.messages.map((m) => m.content).join('\n');
    expect(all).toContain('@@ -1,2 +1,3 @@ fn()');
    expect(all).not.toContain('SHOULD-NOT-LEAK');
  });

  it('flags an unreadable linked spec in the stored intent instead of inventing content', async () => {
    const t = setup({ body: 'Rate limit the API. Spec: docs/specs/limit.md' });
    await t.svc.derive('w', 'p1', { logger: t.logger });
    const s = t.saved()!;
    expect(s.intent).toMatch(/Missing context/);
    expect(s.confidence).toBeLessThanOrEqual(0.5);
    expect(s.requirements).toEqual([]);
    expect(s.sources.find((x) => x.kind === 'spec')).toMatchObject({ fetched: false });
  });

  it('logs prompt composition + model + tokens as metadata only', async () => {
    const t = setup({ body: 'Only a description with a secret-looking text sk-live-ABC123' });
    await t.svc.derive('w', 'p1', { logger: t.logger, correlationId: 'c1' });
    const line = t.logs.find((l) => l.event === 'intent.prompt.assembled')!;
    expect(line).toMatchObject({ model: 'deepseek/deepseek-v4-flash', provider: 'openrouter', tokensIn: 100, tokensOut: 20, correlation_id: 'c1' });
    expect((line.sections as unknown[]).length).toBeGreaterThan(2);
    const dump = JSON.stringify(t.logs);
    expect(dump).not.toContain('sk-live');
    expect(dump).not.toContain('SHOULD-NOT-LEAK');
    expect(dump).not.toContain('@@ -1,2');
  });

  it('reports classifier model, tokens, cost and sources to the Live Log, metadata only', async () => {
    const t = setup({ body: 'Desc sk-live-ABC123' });
    const live: string[] = [];
    const log = { info: (m: string) => live.push(m), tool: (m: string) => live.push(m), result: (m: string) => live.push(m) };
    await t.svc.derive('w', 'p1', { log, logger: t.logger });
    const dump = live.join('\n');
    expect(dump).toContain('model=openrouter/deepseek/deepseek-v4-flash');
    expect(dump).toContain('tokens=100/20');
    expect(dump).toContain('cost=$0.000100');
    expect(dump).toContain('description-1');
    expect(dump).not.toContain('sk-live');
    expect(dump).not.toContain('@@ -1,2');
  });

  it('is cached on unchanged inputs, but force re-derives', async () => {
    const t = setup({ body: 'Desc' });
    await t.svc.derive('w', 'p1', { logger: t.logger });
    const second = await t.svc.derive('w', 'p1', { logger: t.logger });
    expect(second.cached).toBe(true);
    expect(t.calls).toHaveLength(1);
    await t.svc.derive('w', 'p1', { logger: t.logger, force: true });
    expect(t.calls).toHaveLength(2);
  });
});
