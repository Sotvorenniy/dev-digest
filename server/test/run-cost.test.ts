/**
 * run-cost — the read-time cost resolution behind every cost the UI shows.
 * The rules worth pinning: an unpriced model is unknown (not free), a run with
 * no tokens never happened (also unknown), and one unpriceable run must not
 * poison a PR's total.
 */
import { describe, it, expect } from 'vitest';
import { resolveRunCost, sumRunCosts, type CostEstimator } from '../src/platform/run-cost.js';

/** $1 per 1M in, $2 per 1M out — for the one slug we "know". */
const estimate: CostEstimator = (model, tokensIn, tokensOut) =>
  model === 'known/model' ? (tokensIn + tokensOut * 2) / 1_000_000 : null;

const run = (o: Partial<Parameters<typeof resolveRunCost>[1]> = {}) => ({
  costUsd: null,
  model: 'known/model',
  tokensIn: 1_000_000,
  tokensOut: 500_000,
  ...o,
});

describe('resolveRunCost', () => {
  it('prefers the persisted cost — that is what the provider actually charged', () => {
    expect(resolveRunCost(estimate, run({ costUsd: 0.42 }))).toBe(0.42);
  });

  it('re-prices from tokens when the column is null (runs predating 0010)', () => {
    expect(resolveRunCost(estimate, run())).toBeCloseTo(2, 10);
  });

  it('is unknown, not free, for a model with no known price', () => {
    expect(resolveRunCost(estimate, run({ model: 'some/unlisted-model' }))).toBeNull();
  });

  it('is unknown for a run that never reached the model', () => {
    expect(resolveRunCost(estimate, run({ tokensIn: 0, tokensOut: 0 }))).toBeNull();
  });

  it('is unknown when the model or the token counts are missing', () => {
    expect(resolveRunCost(estimate, run({ model: null }))).toBeNull();
    expect(resolveRunCost(estimate, run({ tokensIn: null }))).toBeNull();
  });

  it('keeps a persisted zero — a free model really did cost nothing', () => {
    expect(resolveRunCost(estimate, run({ costUsd: 0 }))).toBe(0);
  });
});

describe('sumRunCosts', () => {
  it('adds up every run on the PR', () => {
    expect(sumRunCosts(estimate, [run({ costUsd: 0.01 }), run({ costUsd: 0.004 })])).toBeCloseTo(
      0.014,
      10,
    );
  });

  it('returns a partial total rather than "—" when one run is unpriceable', () => {
    const runs = [run({ costUsd: 0.014 }), run({ model: 'some/unlisted-model' })];
    expect(sumRunCosts(estimate, runs)).toBeCloseTo(0.014, 10);
  });

  it('is unknown only when not a single run can be priced', () => {
    expect(sumRunCosts(estimate, [run({ model: 'some/unlisted-model' })])).toBeNull();
  });

  it('is unknown for a PR with no runs at all', () => {
    expect(sumRunCosts(estimate, [])).toBeNull();
  });
});
