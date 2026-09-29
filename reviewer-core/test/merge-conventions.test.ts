import { describe, it, expect } from 'vitest';
import type { RawConventionCandidate } from '../src/index.js';
import {
  clusterCandidatesByRuleSimilarity,
  mergeConventionCandidates,
} from '../src/index.js';

function candidate(partial: Partial<RawConventionCandidate>): RawConventionCandidate {
  return {
    rule: 'rule',
    evidence_path: 'src/a.ts',
    evidence_snippet: 'snippet',
    confidence: 0.7,
    ...partial,
  };
}

describe('category carry-through', () => {
  it('a cluster takes the category of its highest-confidence member that has one', () => {
    const clusters = clusterCandidatesByRuleSimilarity([
      candidate({ rule: 'always use async await instead of then chains', evidence_path: 'a.ts', confidence: 0.6, category: 'style' }),
      candidate({ rule: 'always use async await instead of promise chains', evidence_path: 'b.ts', confidence: 0.9, category: 'error-handling' }),
    ]);
    expect(clusters[0]!.category).toBe('error-handling');
  });

  it('category is null when no member provides one', () => {
    const clusters = clusterCandidatesByRuleSimilarity([candidate({ rule: 'some rule' })]);
    expect(clusters[0]!.category).toBeNull();
  });
});

describe('clusterCandidatesByRuleSimilarity', () => {
  it('merges near-duplicate rule text into one cluster (Jaccard >= 0.6)', () => {
    const clusters = clusterCandidatesByRuleSimilarity([
      candidate({ rule: 'always use async await instead of then chains', evidence_path: 'a.ts', confidence: 0.6 }),
      candidate({ rule: 'always use async await instead of promise chains', evidence_path: 'b.ts', confidence: 0.9 }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.members).toHaveLength(2);
    // representative rule text is the highest-individual-confidence member's
    expect(clusters[0]!.rule).toBe('always use async await instead of promise chains');
    expect(clusters[0]!.corroboratingFileCount).toBe(2);
  });

  it('keeps unrelated rules in separate clusters', () => {
    const clusters = clusterCandidatesByRuleSimilarity([
      candidate({ rule: 'always use async await instead of then chains' }),
      candidate({ rule: 'error responses always include a machine-readable code field' }),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it('merges same-file candidates with overlapping evidence line ranges even when rule text differs', () => {
    const clusters = clusterCandidatesByRuleSimilarity([
      candidate({
        rule: 'validation errors are thrown as ValidationError',
        evidence_path: 'src/validate.ts',
        evidence_start_line: 10,
        evidence_end_line: 20,
      }),
      candidate({
        rule: 'input is validated before use',
        evidence_path: 'src/validate.ts',
        evidence_start_line: 15,
        evidence_end_line: 25,
      }),
    ]);
    expect(clusters).toHaveLength(1);
  });

  it('caps displayed evidence at 3 distinct files but counts all distinct files for corroboration', () => {
    const clusters = clusterCandidatesByRuleSimilarity([
      candidate({ rule: 'always validate input at the boundary', evidence_path: 'a.ts' }),
      candidate({ rule: 'always validate input at the boundary', evidence_path: 'b.ts' }),
      candidate({ rule: 'always validate input at the boundary', evidence_path: 'c.ts' }),
      candidate({ rule: 'always validate input at the boundary', evidence_path: 'd.ts' }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.evidence).toHaveLength(3);
    expect(clusters[0]!.corroboratingFileCount).toBe(4);
  });

  it('picks the single highest-confidence snippet as displayEvidence', () => {
    const clusters = clusterCandidatesByRuleSimilarity([
      candidate({ rule: 'always validate input at the boundary', evidence_path: 'a.ts', confidence: 0.4 }),
      candidate({ rule: 'always validate input at the boundary', evidence_path: 'b.ts', confidence: 0.95 }),
    ]);
    expect(clusters[0]!.displayEvidence.path).toBe('b.ts');
    expect(clusters[0]!.displayEvidence.confidence).toBe(0.95);
  });
});

describe('mergeConventionCandidates', () => {
  it('returns clusters as-is (no LLM call) for 0 or 1 cluster', async () => {
    const clusters = clusterCandidatesByRuleSimilarity([candidate({ rule: 'one rule' })]);
    const recorder = {
      id: 'openrouter' as const,
      async completeStructured() {
        throw new Error('should not be called for a single cluster');
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
    const merged = await mergeConventionCandidates({ clusters, llm: recorder, model: 'm' });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.absorbedClusterIds).toEqual([clusters[0]!.id]);
  });

  it('absorbs clusters the LLM groups together, recombining evidence/corroboration counts', async () => {
    const clusters = clusterCandidatesByRuleSimilarity([
      candidate({ rule: 'prefer async await over then chains', evidence_path: 'a.ts', confidence: 0.5 }),
      candidate({ rule: 'avoid promise chains entirely', evidence_path: 'b.ts', confidence: 0.9 }),
    ]);
    expect(clusters).toHaveLength(2); // token heuristic alone would not merge these

    const llm = {
      id: 'openrouter' as const,
      async completeStructured() {
        return {
          data: {
            merged: [
              {
                rule: 'Always use async/await, never .then() chains',
                absorbed_cluster_ids: clusters.map((c) => c.id),
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

    const merged = await mergeConventionCandidates({ clusters, llm, model: 'm' });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.rule).toBe('Always use async/await, never .then() chains');
    expect(merged[0]!.corroboratingFileCount).toBe(2);
    expect(merged[0]!.absorbedClusterIds.sort()).toEqual(clusters.map((c) => c.id).sort());
  });

  it('a cluster id the merge pass forgets becomes its own singleton merged candidate', async () => {
    const clusters = clusterCandidatesByRuleSimilarity([
      candidate({ rule: 'first rule', evidence_path: 'a.ts' }),
      candidate({ rule: 'second unrelated rule', evidence_path: 'b.ts' }),
    ]);
    expect(clusters).toHaveLength(2);

    const llm = {
      id: 'openrouter' as const,
      async completeStructured() {
        return {
          // only mentions the first cluster — the second is silently dropped by the model
          data: { merged: [{ rule: 'first rule', absorbed_cluster_ids: [clusters[0]!.id] }] },
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

    const merged = await mergeConventionCandidates({ clusters, llm, model: 'm' });
    expect(merged).toHaveLength(2);
    const secondRuleMerged = merged.find((m) => m.rule === 'second unrelated rule');
    expect(secondRuleMerged).toBeDefined();
    expect(secondRuleMerged!.absorbedClusterIds).toEqual([clusters[1]!.id]);
  });
});
