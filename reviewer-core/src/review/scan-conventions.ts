import { z } from 'zod';
import type { LLMProvider, RunEventKind } from '@devdigest/shared';
import { assembleConventionScanPrompt } from '../prompt.js';

/**
 * scanConventionsBatch — one LLM call over one batch of whole sample files,
 * asking the model to surface candidate repo-wide code-style conventions.
 *
 * This is the per-call primitive only (mirrors `reviewPullRequest`'s own
 * scope: one structured call in, one parsed result out). Chunking 60-84
 * sample files into batches, running batches with bounded concurrency, and
 * merging results across batches is orchestration that belongs to the
 * SERVER's `executeScan` service method (it needs to read files between
 * steps, which this package cannot do) — not to reviewer-core.
 */

/** Default structured-output reprompt retries for a scan batch call. */
export const DEFAULT_CONVENTION_SCAN_MAX_RETRIES = 2;

/**
 * One LLM-proposed convention candidate, straight off a single batch call —
 * "raw" because it has not yet been deduplicated (`merge-conventions.ts`),
 * verified against held-out files (`verify-conventions.ts`), or grounded
 * against real file content (`convention-grounding.ts`).
 */
export const RawConventionCandidate = z.object({
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  evidence_start_line: z.number().int().nullish(),
  evidence_end_line: z.number().int().nullish(),
  confidence: z.number().min(0).max(1),
  /** Short topic label (e.g. naming, error-handling, structure, testing, imports, api). */
  category: z.string(),
});
export type RawConventionCandidate = z.infer<typeof RawConventionCandidate>;

// Object root (not a bare array) — OpenAI strict JSON-schema mode requires an
// object at the top level, same reason `Review` wraps `findings` rather than
// the LLM returning a bare findings array (see `../../server/src/vendor/shared/contracts/findings.ts`).
const ConventionScanBatchOutput = z.object({
  candidates: z.array(RawConventionCandidate),
});
type ConventionScanBatchOutput = z.infer<typeof ConventionScanBatchOutput>;

/** Progress event emitted during a scan batch call (mirrors `ReviewEvent`). */
export interface ScanConventionsEvent {
  kind: RunEventKind;
  msg: string;
  data?: unknown;
}

export interface ScanConventionsBatchInput {
  /** Scan agent's system prompt (trusted). */
  systemPrompt: string;
  /** Model id understood by the injected provider. */
  model: string;
  /** This batch's whole sample files (a slice of the caller's full sample set). */
  sampleFiles: { path: string; content: string }[];
  /** Caller-derived lint/formatter note; forwarded as-is to `assembleConventionScanPrompt`. */
  lintConfigNote?: string;
  /** Injected LLM provider. */
  llm: LLMProvider;
  /**
   * OpenRouter session id — forward the SAME id across every batch/merge/verify
   * call of one scan so they group into one session in the OpenRouter dashboard,
   * same convention as `ReviewInput.sessionId`.
   */
  sessionId?: string;
  /** Override the structured-output retry budget. */
  maxRetries?: number;
  /** Progress sink. */
  onEvent?: (e: ScanConventionsEvent) => void;
  /** Cancellation checkpoint, called before the (expensive) LLM call. */
  checkCancelled?: () => void;
}

export interface ScanConventionsBatchOutcome {
  candidates: RawConventionCandidate[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Raw model output (for the run trace / debugging a bad batch). */
  raw: string;
}

export async function scanConventionsBatch(
  input: ScanConventionsBatchInput,
): Promise<ScanConventionsBatchOutcome> {
  input.checkCancelled?.();
  const emit = (kind: RunEventKind, msg: string, data?: unknown) =>
    input.onEvent?.({ kind, msg, data });

  const { messages } = assembleConventionScanPrompt({
    systemPrompt: input.systemPrompt,
    sampleFiles: input.sampleFiles,
    lintConfigNote: input.lintConfigNote,
  });

  emit('tool', `scan: analyzing ${input.sampleFiles.length} sample file(s)`, {
    files: input.sampleFiles.map((f) => f.path),
  });

  const res = await input.llm.completeStructured<ConventionScanBatchOutput>({
    model: input.model,
    schema: ConventionScanBatchOutput,
    schemaName: 'ConventionScanBatch',
    messages,
    maxRetries: input.maxRetries ?? DEFAULT_CONVENTION_SCAN_MAX_RETRIES,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  emit('result', `scan: ${res.data.candidates.length} candidate convention(s) found`);

  return {
    candidates: res.data.candidates,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    raw: res.raw,
  };
}
