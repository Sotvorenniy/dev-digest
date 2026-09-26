import type { FindingActionKind } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/**
 * Severities offered as counter pills and filter buttons, worst first.
 * Only the three the findings contract emits — `SEVERITY_ORDER` keeps an INFO
 * entry as a sort fallback, but no finding is ever stored with it.
 */
export const SEVERITY_FILTERS = ["CRITICAL", "WARNING", "SUGGESTION"] as const;
export type SeverityFilter = (typeof SEVERITY_FILTERS)[number];

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};
