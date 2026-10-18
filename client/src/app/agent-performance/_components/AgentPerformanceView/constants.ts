/** Fewer decided findings than this and an accept rate is a small sample (AC14). */
export const SMALL_SAMPLE_THRESHOLD = 10;

export const DEFAULT_RANGE = "30d";
export const RANGES = ["1d", "30d", "custom"] as const;

/** A custom range may span at most this many inclusive days (AC4). */
export const MAX_CUSTOM_DAYS = 365;
/** Mirrors the server's MAX_PERIOD_MS. */
export const MAX_PERIOD_MS = 366 * 24 * 3600 * 1000;

export const HOUR_MS = 3600 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const SKELETON_ROWS = 5;

/** Donut slice colours, by index. CSS variables only. */
export const DONUT_COLORS = [
  "var(--accent)",
  "var(--ok)",
  "var(--warn)",
  "var(--crit)",
  "var(--info)",
  "var(--text-muted)",
] as const;
