/** Onboarding tour limits (SPEC-02). */

// Section sizes.
export const READING_PATH_MAX = 10;
export const READING_PATH_MIN = 6;
export const CRITICAL_PATHS_MAX = 8;
export const ARCH_NODES_MAX = 12;
export const FIRST_TASKS_MIN = 3;
export const FIRST_TASKS_MAX = 5;
/** Files whose endpoint/cron facts are sent to the model. */
export const FACT_FILES_MAX = 40;

// LLM request.
export const PROMPT_TOKEN_BUDGET = 12_000;
export const MAX_OUTPUT_TOKENS = 4_000;
export const LLM_TIMEOUT_MS = 90_000;

// Background job.
export const ONBOARDING_JOB_KIND = 'onboarding-generate';
export const ONBOARDING_JOB_TIMEOUT_MS = 120_000;
export const ONBOARDING_JOB_RETRIES = 0;

// Bounds on the non-file prompt blocks.
export const README_EXCERPT_MAX_CHARS = 4_000;
export const README_COMMANDS_MAX = 20;
/** A README shell line longer than this is not offered as a run command. */
export const README_COMMAND_MAX_CHARS = 200;
export const CANDIDATE_COMMANDS_MAX = 60;
export const STACK_DEPS_MAX = 40;
export const ENDPOINTS_PER_FILE_MAX = 10;

/** Per-route rate limit for the generate endpoint. */
export const GENERATE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
