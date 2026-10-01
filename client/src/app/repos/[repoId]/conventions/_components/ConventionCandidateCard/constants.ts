/** Confidence-tier thresholds + color mapping for ConventionCandidateCard's
 *  bar — matches the mockup's green/amber/red tiers. Computed client-side
 *  from the server's numeric confidence, not a self-reported label. */
export const HIGH_CONFIDENCE_THRESHOLD = 0.75;
export const MEDIUM_CONFIDENCE_THRESHOLD = 0.5;

/** How long the "Copied" state shows before reverting to "Copy snippet". */
export const COPIED_RESET_MS = 1500;

export function confidenceColor(value: number): string {
  if (value >= HIGH_CONFIDENCE_THRESHOLD) return "var(--ok)";
  if (value >= MEDIUM_CONFIDENCE_THRESHOLD) return "var(--warn)";
  return "var(--crit)";
}
