/**
 * @devdigest/reviewer-core — the review engine.
 *
 * Pure review logic shared by the server (local reviews in the studio) and the
 * agent-runner (CI). NO database, GitHub, or filesystem access; the only side
 * effect is an LLM call through an INJECTED LLMProvider (so it is mock-testable).
 *
 * Consumers wire it via a tsconfig path alias (`@devdigest/reviewer-core` →
 * `../reviewer-core/src`) and consume the TypeScript source directly (tsx in
 * dev, vitest in tests, @vercel/ncc bundle in the runner). The package itself
 * never emits JS — its `build` is a type-check.
 */

// Prompt assembly + prompt-injection hardening.
export {
  assemblePrompt,
  assembleConventionScanPrompt,
  wrapUntrusted,
  INJECTION_GUARD,
  type PromptParts,
  type AssembledPrompt,
  type ConventionScanPromptParts,
} from './prompt.js';

// Citation grounding — the mandatory mechanical gate for diff findings.
export { groundFindings, groundingSummary, type GroundingResult } from './grounding.js';

// Citation grounding for convention candidates (sibling gate, whole-file evidence).
export {
  groundConventionCandidates,
  conventionGroundingSummary,
  MAX_CONVENTION_EVIDENCE_LINE_SPAN,
  type GroundedConventionCandidate,
  type ConventionGroundingResult,
} from './convention-grounding.js';

// Structured-output helpers (Zod → JSON Schema + parse-with-repair).
export {
  toJsonSchema,
  extractJson,
  parseWithRepair,
  type JsonSchema,
  type ParseResult,
} from './llm/structured.js';

// Map-reduce helpers (reduce partials, slice a file's diff).
export { reduceReviews, sliceDiff } from './review/reduce.js';

// The engine entry point: given (diff + resolved agent inputs + LLM) → grounded Review.
export {
  reviewPullRequest,
  DEFAULT_MAP_THRESHOLD_LINES,
  DEFAULT_REVIEW_MAX_RETRIES,
  type ReviewInput,
  type ReviewOutcome,
  type ReviewEvent,
  type ReviewStrategy,
  type ReviewMode,
} from './review/run.js';

// Convention-detection pipeline primitives (scan → cluster+merge → verify →
// ground → score). Chunking/orchestration across batches lives in the
// server's `executeScan` service, not here — these are per-step building
// blocks, same scope as `reviewPullRequest`'s single-review call.
export {
  scanConventionsBatch,
  DEFAULT_CONVENTION_SCAN_MAX_RETRIES,
  RawConventionCandidate,
  type ScanConventionsBatchInput,
  type ScanConventionsBatchOutcome,
  type ScanConventionsEvent,
} from './review/scan-conventions.js';

export {
  clusterCandidatesByRuleSimilarity,
  mergeConventionCandidates,
  DEFAULT_MERGE_CONVENTIONS_MAX_RETRIES,
  type ClusterEvidence,
  type CandidateCluster,
  type MergedCandidate,
  type MergeConventionCandidatesInput,
} from './review/merge-conventions.js';

export {
  verifyConventions,
  DEFAULT_VERIFY_CONVENTIONS_MAX_RETRIES,
  ConventionVerificationVerdict,
  VerificationResult,
  type VerifyConventionsInput,
} from './review/verify-conventions.js';

export {
  computeConfidence,
  CONFIDENCE_FLOOR,
  type ComputeConfidenceInput,
} from './review/confidence.js';

// Output: grounded Review → GitHubReviewPayload (body + inline comments + event).
export {
  toReviewPayload,
  gateTriggered,
  countBlockers,
  type ToReviewOptions,
} from './output/to-review.js';

// The single OpenAI-compatible structured provider (OpenRouter), shared by the
// CI runner and the server's openrouter path. Owns session grouping + guards.
export { OpenRouterProvider, type OpenRouterProviderOptions } from './llm/openrouter.js';
