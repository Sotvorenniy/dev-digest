import type { ConventionVerificationVerdict } from './verify-conventions.js';

/**
 * Computed (not self-reported) confidence for a convention candidate.
 *
 * The LLM's own per-candidate `confidence` is a self-report with no anchor —
 * same failure mode `scoreFromFindings` (reduce.ts) exists to fix for review
 * scores. Here the final number rewards independent corroboration (multiple
 * distinct sample files agreeing) and the verification pass's held-out-file
 * check, instead of trusting whatever number the model wrote next to its own
 * candidate.
 */

/** Candidates scoring below this (or verdict `file_local`) are filtered out before reaching the UI. */
export const CONFIDENCE_FLOOR = 0.35;

/** Cap on how much independent-file corroboration alone can boost confidence. */
const MAX_EVIDENCE_MULTIPLIER = 1.4;
/** Each additional corroborating file beyond the first adds this much to the multiplier, up to the cap. */
const EVIDENCE_MULTIPLIER_STEP = 0.1;

const VERIFICATION_BONUS_REPO_WIDE_STRONG = 0.15; // repo_wide, >=2 held-out confirmations
const VERIFICATION_BONUS_REPO_WIDE_WEAK = 0.05; // repo_wide, exactly 1 held-out confirmation
const VERIFICATION_BONUS_INCONCLUSIVE = 0.0;
const VERIFICATION_PENALTY_FILE_LOCAL = -0.35;

export interface ComputeConfidenceInput {
  /** Mean of the LLM's own per-member confidence values (from the cluster/merged candidate). */
  meanLlmConfidence: number;
  /** Distinct sample files whose evidence corroborates this candidate. */
  corroboratingFileCount: number;
  /** The verification pass's verdict for this candidate. */
  verificationVerdict: ConventionVerificationVerdict;
  /**
   * Held-out files the verification pass CONFIRMED the rule in
   * (`VerificationResult.confirmed_in_files.length`). Only consulted when
   * `verificationVerdict === 'repo_wide'`.
   */
  confirmedHeldOutFileCount?: number;
}

/**
 * `final = clamp(mean_llm_confidence * evidence_multiplier + verification_bonus, 0, 1)`
 * where `evidence_multiplier = min(1 + 0.1 * (corroboratingFileCount - 1), 1.4)`.
 */
export function computeConfidence(input: ComputeConfidenceInput): number {
  const evidenceMultiplier = Math.min(
    1 + EVIDENCE_MULTIPLIER_STEP * (input.corroboratingFileCount - 1),
    MAX_EVIDENCE_MULTIPLIER,
  );

  const confirmedCount = input.confirmedHeldOutFileCount ?? 0;
  const verificationBonus =
    input.verificationVerdict === 'file_local'
      ? VERIFICATION_PENALTY_FILE_LOCAL
      : input.verificationVerdict === 'repo_wide'
        ? confirmedCount >= 2
          ? VERIFICATION_BONUS_REPO_WIDE_STRONG
          : confirmedCount === 1
            ? VERIFICATION_BONUS_REPO_WIDE_WEAK
            : VERIFICATION_BONUS_INCONCLUSIVE
        : VERIFICATION_BONUS_INCONCLUSIVE; // 'inconclusive'

  const raw = input.meanLlmConfidence * evidenceMultiplier + verificationBonus;
  return Math.max(0, Math.min(1, raw));
}
