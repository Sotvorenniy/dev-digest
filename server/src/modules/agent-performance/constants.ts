/** Run statuses that count toward the dashboard: only runs that have ended. */
export const FINISHED_RUN_STATUSES = ['done', 'failed', 'cancelled'] as const;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Longest period the endpoints accept (366 days). */
export const MAX_PERIOD_MS = 366 * DAY_MS;

/** Periods up to this long are bucketed hourly in the runs series, longer ones daily. */
export const HOURLY_BUCKET_MAX_MS = 48 * HOUR_MS;

/** Number of most recent runs kept in the per-agent findings trend. */
export const TREND_RUNS = 10;
