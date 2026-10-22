/** Constants for the eval module. */

/** Hard cap on one case's review call (the provider itself times out at 90 s, no transport retries). */
export const EVAL_CASE_TIMEOUT_MS = 120_000;

/** Run history length returned by `GET /agents/:id/eval-runs`. */
export const EVAL_RUN_HISTORY_LIMIT = 20;

/** Each accepted "run all" can spend one LLM call per case: tight per-route limit. */
export const EVAL_RUN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

/** Stored on a run that was still `running` when the process restarted. */
export const EVAL_RESTART_REASON = 'Server restarted while the run was in progress';
