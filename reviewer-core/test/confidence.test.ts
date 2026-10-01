import { describe, it, expect } from 'vitest';
import { computeConfidence, CONFIDENCE_FLOOR } from '../src/index.js';

/**
 * `computeConfidence` — the mandatory-boundary cases from the plan:
 * final = clamp(mean_llm_confidence * evidence_multiplier + verification_bonus, 0, 1)
 * evidence_multiplier = min(1 + 0.1 * (corroboratingFileCount - 1), 1.4)
 */
describe('computeConfidence', () => {
  it('CONFIDENCE_FLOOR is 0.35', () => {
    expect(CONFIDENCE_FLOOR).toBe(0.35);
  });

  it('single-file, inconclusive verification: multiplier=1, bonus=0 (identity)', () => {
    const c = computeConfidence({
      meanLlmConfidence: 0.6,
      corroboratingFileCount: 1,
      verificationVerdict: 'inconclusive',
    });
    expect(c).toBeCloseTo(0.6, 5);
  });

  it('evidence multiplier caps at 1.4x regardless of how many files corroborate', () => {
    const at5Files = computeConfidence({
      meanLlmConfidence: 0.5,
      corroboratingFileCount: 5, // 1 + 0.1*4 = 1.4, exactly the cap
      verificationVerdict: 'inconclusive',
    });
    const at20Files = computeConfidence({
      meanLlmConfidence: 0.5,
      corroboratingFileCount: 20, // would be 1 + 0.1*19 = 2.9 uncapped
      verificationVerdict: 'inconclusive',
    });
    expect(at5Files).toBeCloseTo(0.7, 5); // 0.5 * 1.4
    expect(at20Files).toBeCloseTo(0.7, 5); // capped at the same 1.4x
  });

  it('repo_wide with >=2 held-out confirmations adds +0.15', () => {
    const c = computeConfidence({
      meanLlmConfidence: 0.5,
      corroboratingFileCount: 1,
      verificationVerdict: 'repo_wide',
      confirmedHeldOutFileCount: 3,
    });
    expect(c).toBeCloseTo(0.65, 5);
  });

  it('repo_wide with exactly 1 held-out confirmation adds only +0.05', () => {
    const c = computeConfidence({
      meanLlmConfidence: 0.5,
      corroboratingFileCount: 1,
      verificationVerdict: 'repo_wide',
      confirmedHeldOutFileCount: 1,
    });
    expect(c).toBeCloseTo(0.55, 5);
  });

  it('repo_wide with 0 held-out confirmations adds nothing (treated like inconclusive)', () => {
    const c = computeConfidence({
      meanLlmConfidence: 0.5,
      corroboratingFileCount: 1,
      verificationVerdict: 'repo_wide',
      confirmedHeldOutFileCount: 0,
    });
    expect(c).toBeCloseTo(0.5, 5);
  });

  it('file_local applies a -0.35 penalty and can push a candidate below the floor', () => {
    const c = computeConfidence({
      meanLlmConfidence: 0.5,
      corroboratingFileCount: 1,
      verificationVerdict: 'file_local',
    });
    expect(c).toBeCloseTo(0.15, 5);
    expect(c).toBeLessThan(CONFIDENCE_FLOOR);
  });

  it('clamps to 0 rather than going negative', () => {
    const c = computeConfidence({
      meanLlmConfidence: 0.1,
      corroboratingFileCount: 1,
      verificationVerdict: 'file_local',
    });
    expect(c).toBe(0);
  });

  it('clamps to 1 rather than exceeding it', () => {
    const c = computeConfidence({
      meanLlmConfidence: 1,
      corroboratingFileCount: 5,
      verificationVerdict: 'repo_wide',
      confirmedHeldOutFileCount: 5,
    });
    expect(c).toBe(1);
  });

  it('a middling self-reported confidence with strong corroboration and verification clears the floor', () => {
    const c = computeConfidence({
      meanLlmConfidence: 0.4,
      corroboratingFileCount: 3, // 1 + 0.1*2 = 1.2
      verificationVerdict: 'repo_wide',
      confirmedHeldOutFileCount: 2,
    });
    // 0.4 * 1.2 + 0.15 = 0.63
    expect(c).toBeCloseTo(0.63, 5);
    expect(c).toBeGreaterThanOrEqual(CONFIDENCE_FLOOR);
  });
});
