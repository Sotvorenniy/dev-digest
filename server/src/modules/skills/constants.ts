/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default skill description when none is supplied on insert. */
export const DEFAULT_SKILL_DESCRIPTION = '';

/** Size cap for a `POST /skills/fetch-url` preview fetch. */
export const FETCH_URL_MAX_BYTES = 200 * 1024;

/** Timeout for a `POST /skills/fetch-url` preview fetch. */
export const FETCH_URL_TIMEOUT_MS = 5000;
