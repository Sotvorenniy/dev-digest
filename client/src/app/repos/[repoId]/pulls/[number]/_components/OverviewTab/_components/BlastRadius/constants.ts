/** repo-intel DegradedReason (snake_case wire value) → blast.json `degraded.reason.*` key. */
export const REASON_KEYS = {
  flag_off: "flagOff",
  index_failed: "indexFailed",
  index_partial: "indexPartial",
  repo_too_large: "repoTooLarge",
  no_data: "noData",
} as const;

/** Shown when the server sends no reason or one this client does not know. */
export const FALLBACK_REASON_KEY = "unknown" as const;

/** Stop waiting for a resync to advance the index stamp after this long (a no-op resync never does). */
export const RESYNC_WAIT_MS = 60_000;
