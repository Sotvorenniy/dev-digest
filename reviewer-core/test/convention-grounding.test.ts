import { describe, it, expect } from 'vitest';
import type { MergedCandidate } from '../src/index.js';
import { groundConventionCandidates, conventionGroundingSummary } from '../src/index.js';

const FILE_CONTENT = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
const REAL_SNIPPET = 'line 5';

function merged(partial: Partial<MergedCandidate['displayEvidence']> = {}): MergedCandidate {
  const displayEvidence = {
    path: 'src/a.ts',
    snippet: REAL_SNIPPET,
    startLine: 5,
    endLine: 5,
    confidence: 0.8,
    ...partial,
  };
  return {
    id: 'merged-0',
    rule: 'a rule',
    evidence: [displayEvidence],
    displayEvidence,
    meanLlmConfidence: 0.8,
    corroboratingFileCount: 1,
    absorbedClusterIds: ['cluster-0'],
  };
}

describe('groundConventionCandidates', () => {
  const sampleFiles = { 'src/a.ts': FILE_CONTENT };

  it('keeps a candidate whose evidence path, line range, and snippet are all real', () => {
    const res = groundConventionCandidates([merged()], sampleFiles);
    expect(res.kept).toHaveLength(1);
    expect(res.dropped).toHaveLength(0);
  });

  it('drops a candidate whose evidence_path is not one of the sampled files', () => {
    const res = groundConventionCandidates([merged({ path: 'src/not-sampled.ts' })], sampleFiles);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/not one of the sampled files/);
  });

  it('drops a candidate whose line range spans over the 60-line limit', () => {
    const res = groundConventionCandidates(
      [merged({ startLine: 1, endLine: 65, snippet: 'line 1' })],
      sampleFiles,
    );
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/over the 60-line limit/);
  });

  it('drops a candidate whose line range falls outside the file', () => {
    const res = groundConventionCandidates(
      [merged({ startLine: 95, endLine: 150, snippet: 'line 95' })],
      sampleFiles,
    );
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/out of range/);
  });

  it('drops a candidate whose snippet does not appear verbatim in the file (fabricated/paraphrased)', () => {
    const res = groundConventionCandidates(
      [merged({ snippet: 'this text was never in the file' })],
      sampleFiles,
    );
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/fabricated or paraphrased/);
  });

  it('keeps a candidate with no line numbers as long as the snippet is real', () => {
    const res = groundConventionCandidates(
      [merged({ startLine: null, endLine: null, snippet: 'line 42' })],
      sampleFiles,
    );
    expect(res.kept).toHaveLength(1);
  });

  it('conventionGroundingSummary reports kept/total', () => {
    const res = groundConventionCandidates(
      [merged(), merged({ path: 'src/missing.ts' })],
      sampleFiles,
    );
    expect(conventionGroundingSummary(res)).toBe('1/2 passed');
  });
});
