import { describe, it, expect } from 'vitest';
import type { MergedCandidate } from '../src/index.js';
import { verifyConventions } from '../src/index.js';

function merged(partial: Partial<MergedCandidate>): MergedCandidate {
  const evidence = {
    path: 'src/a.ts',
    snippet: 'const x = 1;',
    startLine: 1,
    endLine: 1,
    confidence: 0.8,
  };
  return {
    id: 'merged-0',
    rule: 'a rule',
    evidence: [evidence],
    displayEvidence: evidence,
    meanLlmConfidence: 0.8,
    corroboratingFileCount: 1,
    absorbedClusterIds: ['cluster-0'],
    ...partial,
  };
}

describe('verifyConventions', () => {
  it('returns [] without calling the LLM when there are no candidates', async () => {
    const llm = {
      id: 'openrouter' as const,
      async completeStructured() {
        throw new Error('should not be called with zero candidates');
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
    const results = await verifyConventions({ candidates: [], heldOutFiles: [], llm, model: 'm' });
    expect(results).toEqual([]);
  });

  it('maps the LLM verdict back onto the matching candidate id', async () => {
    const candidates = [merged({ id: 'merged-a' }), merged({ id: 'merged-b' })];
    const llm = {
      id: 'openrouter' as const,
      async completeStructured() {
        return {
          data: {
            results: [
              {
                candidate_id: 'merged-a',
                confirmed_in_files: ['src/held1.ts', 'src/held2.ts'],
                contradicted_in_files: [],
                verdict: 'repo_wide' as const,
              },
              {
                candidate_id: 'merged-b',
                confirmed_in_files: [],
                contradicted_in_files: ['src/held1.ts'],
                verdict: 'file_local' as const,
              },
            ],
          },
          model: 'm',
          tokensIn: 1,
          tokensOut: 1,
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

    const results = await verifyConventions({
      candidates,
      heldOutFiles: [
        { path: 'src/held1.ts', content: 'x' },
        { path: 'src/held2.ts', content: 'y' },
      ],
      llm,
      model: 'm',
    });

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.candidate_id === 'merged-a')!.verdict).toBe('repo_wide');
    expect(results.find((r) => r.candidate_id === 'merged-b')!.verdict).toBe('file_local');
  });

  it('backfills an explicit "inconclusive" result for a candidate the model forgot to verify', async () => {
    const candidates = [merged({ id: 'merged-a' }), merged({ id: 'merged-forgotten' })];
    const llm = {
      id: 'openrouter' as const,
      async completeStructured() {
        return {
          data: {
            results: [
              {
                candidate_id: 'merged-a',
                confirmed_in_files: [],
                contradicted_in_files: [],
                verdict: 'inconclusive' as const,
              },
            ],
          },
          model: 'm',
          tokensIn: 1,
          tokensOut: 1,
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

    const results = await verifyConventions({ candidates, heldOutFiles: [], llm, model: 'm' });
    expect(results).toHaveLength(2);
    const forgotten = results.find((r) => r.candidate_id === 'merged-forgotten')!;
    expect(forgotten.verdict).toBe('inconclusive');
    expect(forgotten.confirmed_in_files).toEqual([]);
    expect(forgotten.contradicted_in_files).toEqual([]);
  });
});
