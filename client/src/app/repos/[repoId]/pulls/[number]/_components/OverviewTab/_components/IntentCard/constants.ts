/** Confidence thresholds — mirror of the server's domain rule (high >= 0.75, medium >= 0.5). */
export const HIGH_CONFIDENCE = 0.75;
export const MEDIUM_CONFIDENCE = 0.5;

/** Badge colours per confidence level. */
export const LEVEL_COLORS = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--bg-hover)" },
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
} as const;
