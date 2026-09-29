import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../../server/src/adapters/mocks.js';
import { scanConventionsBatch } from '../src/index.js';

/**
 * scanConventionsBatch — the per-batch primitive of the convention-detection
 * pipeline. One LLM call over one batch of whole sample files; chunking across
 * batches is the server's job (`executeScan`), not tested here.
 */

const fixture = {
  candidates: [
    {
      rule: 'Always use async/await instead of .then() chains',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: 'const user = await db.users.findOne(id);',
      evidence_start_line: 12,
      evidence_end_line: 12,
      confidence: 0.82,
      category: 'style',
    },
  ],
};

describe('scanConventionsBatch category', () => {
  it('parses the required category and rejects a candidate without one', async () => {
    const run = (candidates: unknown[]) =>
      scanConventionsBatch({
        systemPrompt: 's',
        model: 'm',
        sampleFiles: [{ path: 'src/api/users.ts', content: 'x' }],
        llm: new MockLLMProvider('openai', { structuredBySchema: { ConventionScanBatch: { candidates } } }),
      });
    const ok = await run([{ ...fixture.candidates[0]!, category: 'naming' }]);
    expect(ok.candidates[0]!.category).toBe('naming');
    const { category: _c, ...noCategory } = fixture.candidates[0]!;
    await expect(run([noCategory])).rejects.toThrow();
  });
});

describe('scanConventionsBatch', () => {
  it('assembles a prompt from whole sample files and returns parsed candidates', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionScanBatch: fixture } });
    const events: string[] = [];

    const outcome = await scanConventionsBatch({
      systemPrompt: 'You detect repo-wide code-style conventions.',
      model: 'gpt-4.1',
      sampleFiles: [
        { path: 'src/api/users.ts', content: 'const user = await db.users.findOne(id);' },
      ],
      llm,
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.candidates).toHaveLength(1);
    expect(outcome.candidates[0]!.rule).toMatch(/async\/await/);
    expect(outcome.tokensIn).toBeGreaterThan(0);
    expect(events.some((m) => m.includes('sample file'))).toBe(true);
    expect(events.some((m) => m.includes('candidate convention'))).toBe(true);
  });

  it('folds the lint-config note into the system prompt only when present', async () => {
    const seen: string[] = [];
    const recorder = {
      id: 'openrouter' as const,
      async completeStructured(req: any) {
        seen.push(req.messages[0]!.content);
        return {
          data: fixture,
          model: req.model,
          tokensIn: 10,
          tokensOut: 5,
          costUsd: 0,
          raw: '{}',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };

    await scanConventionsBatch({
      systemPrompt: 'sys',
      model: 'gpt-4.1',
      sampleFiles: [{ path: 'a.ts', content: 'x' }],
      lintConfigNote: 'ESLint + Prettier config detected',
      llm: recorder,
    });
    await scanConventionsBatch({
      systemPrompt: 'sys',
      model: 'gpt-4.1',
      sampleFiles: [{ path: 'a.ts', content: 'x' }],
      llm: recorder,
    });

    expect(seen[0]).toMatch(/linter or formatter already enforces mechanically/);
    expect(seen[0]).toContain('ESLint + Prettier config detected');
    expect(seen[1]).not.toMatch(/linter or formatter already enforces mechanically/);
  });

  it('forwards sessionId and maxRetries to the LLM call', async () => {
    const seen: { sessionId?: string; maxRetries?: number }[] = [];
    const recorder = {
      id: 'openrouter' as const,
      async completeStructured(req: any) {
        seen.push({ sessionId: req.sessionId, maxRetries: req.maxRetries });
        return {
          data: fixture,
          model: req.model,
          tokensIn: 10,
          tokensOut: 5,
          costUsd: 0,
          raw: '{}',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };

    await scanConventionsBatch({
      systemPrompt: 'sys',
      model: 'gpt-4.1',
      sampleFiles: [{ path: 'a.ts', content: 'x' }],
      llm: recorder,
      sessionId: 'sess-1',
      maxRetries: 5,
    });

    expect(seen[0]).toEqual({ sessionId: 'sess-1', maxRetries: 5 });
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionScanBatch: fixture } });
    await expect(
      scanConventionsBatch({
        systemPrompt: 'sys',
        model: 'gpt-4.1',
        sampleFiles: [{ path: 'a.ts', content: 'x' }],
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });
});
