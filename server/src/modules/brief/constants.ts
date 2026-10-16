/** PR brief caps and budgets. Everything is bounded before the single model call. */

export const BRIEF_MAX_FILES = 300;
export const BRIEF_HUNKS_PER_FILE = 20;
export const BRIEF_DESCRIPTION_MAX_CHARS = 8_000;
export const BRIEF_ISSUE_BODY_MAX_CHARS = 4_000;
export const BRIEF_TITLE_MAX_CHARS = 500;
/** Mirrors `reviewer-core/src/prompt.ts` (intent block cap). */
export const BRIEF_INTENT_MAX_CHARS = 4_000;
export const BRIEF_BLAST_SUMMARY_MAX_CHARS = 2_000;
export const BRIEF_MAX_CALLER_PATHS = 100;
export const BRIEF_PROMPT_TOKEN_BUDGET = 40_000;
export const BRIEF_MAX_RISKS = 8;
export const BRIEF_MAX_FOCUS = 8;
export const BRIEF_LLM_TIMEOUT_MS = 90_000;
export const BRIEF_ISSUE_TIMEOUT_MS = 5_000;
export const BRIEF_MAX_OUTPUT_TOKENS = 5_000;
export const BRIEF_GENERATE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
