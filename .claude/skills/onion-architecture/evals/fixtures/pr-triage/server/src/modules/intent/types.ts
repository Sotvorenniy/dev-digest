/**
 * intent — contract for other modules.
 * Consumers use these instead of reaching into the module's files.
 */
export type { ConfidenceLevel, DocLink } from './domain.js';
export type { IntentPullInfo, IntentRepoInfo } from './ports.js';
export { IntentService, type DeriveResult } from './service.js';
export { INTENT_TIMEOUT_MS } from './constants.js';
