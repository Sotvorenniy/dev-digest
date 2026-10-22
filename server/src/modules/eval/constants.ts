/** Constants for the eval module. */

/** Hard cap on one case's review call (the provider itself times out at 90 s, no transport retries). */
export const EVAL_CASE_TIMEOUT_MS = 120_000;

/** Run history length returned by `GET /agents/:id/eval-runs`. */
export const EVAL_RUN_HISTORY_LIMIT = 20;

/** Finished runs behind each agent's recall sparkline on the dashboard. */
export const RECALL_SERIES_RUNS = 10;

/** Newest runs listed across all agents on the dashboard. */
export const RECENT_RUNS_LIMIT = 10;

/** Run table length on the per-agent dashboard (same window as the run history). */
export const AGENT_RUN_TABLE_LIMIT = EVAL_RUN_HISTORY_LIMIT;

/** Finished runs read for the per-agent trend chart. */
export const AGENT_TREND_RUNS_LIMIT = 100;

/** Each accepted "run all" can spend one LLM call per case: tight per-route limit. */
export const EVAL_RUN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

/** Stored on a run that was still `running` when the process restarted. */
export const EVAL_RESTART_REASON = 'Server restarted while the run was in progress';

/** Most cases one agent can hold; stops a runaway client from filling the table and every set run. */
export const MAX_EVAL_CASES_PER_AGENT = 200;
