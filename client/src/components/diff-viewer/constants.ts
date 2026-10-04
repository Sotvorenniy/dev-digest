/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Severity -> `shell.diffViewer.findingLabel.*` key suffix. */
export const FINDING_LINE_LABEL_KEY: Record<string, "blocker" | "warning" | "suggestion"> = {
  CRITICAL: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};

/** Severity -> colour token (mirrors FindingCard's SEV_COLOR; shared code cannot import a route's `_components`). */
export const SEV: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
};
export const SEV_FALLBACK = "var(--text-muted)";
