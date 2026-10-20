import type { AgentStats } from "@/lib/types";

export type FindingsByCategory = AgentStats["findings_by_category"];

/** Legend/donut order; `other` is shown only when above 0. */
export const CATEGORY_ORDER: readonly (keyof FindingsByCategory)[] = ["bug", "security", "perf", "style", "test", "other"];

/** Donut slice colours by `CATEGORY_ORDER` index. CSS variables only. */
export const CATEGORY_COLORS = [
  "var(--accent)",
  "var(--crit)",
  "var(--warn)",
  "var(--info)",
  "var(--ok)",
  "var(--text-muted)",
] as const;

/** Severity bar colours. CSS variables only. */
export const SEVERITY_COLORS = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--info)",
} as const;

export const SKELETON_KPI_COUNT = 4;
export const SKELETON_PANEL_COUNT = 4;

/** Mirrors the server's HOURLY_BUCKET_MAX_MS (agent-performance/constants.ts): up to 48 h the runs series is hourly. */
export const HOURLY_BUCKET_MAX_MS = 48 * 3600 * 1000;
