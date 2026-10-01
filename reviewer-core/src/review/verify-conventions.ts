import { z } from 'zod';
import type { ChatMessage, LLMProvider } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '../prompt.js';
import type { MergedCandidate } from './merge-conventions.js';

/**
 * Verification pass — the highest-leverage step in the pipeline. Checks the
 * merged candidates against a shared pool of held-out sample files (files not
 * used as any candidate's own evidence). ONE batched call, not one per
 * candidate, to bound cost regardless of how many candidates survived the
 * merge stage. `file_local` is exactly "this looked like a convention but was
 * really just one file's incidental pattern" — the biggest source of false
 * positives in a naive single-pass design.
 */

export const ConventionVerificationVerdict = z.enum(['repo_wide', 'file_local', 'inconclusive']);
export type ConventionVerificationVerdict = z.infer<typeof ConventionVerificationVerdict>;

export const VerificationResult = z.object({
  candidate_id: z.string(),
  confirmed_in_files: z.array(z.string()),
  contradicted_in_files: z.array(z.string()),
  verdict: ConventionVerificationVerdict,
});
export type VerificationResult = z.infer<typeof VerificationResult>;

const VerifyConventionsOutput = z.object({
  results: z.array(VerificationResult),
});
type VerifyConventionsOutput = z.infer<typeof VerifyConventionsOutput>;

export const DEFAULT_VERIFY_CONVENTIONS_MAX_RETRIES = 2;

const VERIFY_SYSTEM_PROMPT =
  'You verify candidate repo-wide code-style conventions against a pool of held-out ' +
  'sample files — files that were NOT used as evidence for any candidate. For EACH ' +
  'candidate, check whether the held-out files follow the stated rule, contradict it, or ' +
  'say nothing about it. List every held-out file path where the rule is followed under ' +
  'confirmed_in_files, and every file path where the code contradicts the rule under ' +
  'contradicted_in_files (a file that is simply silent on the rule belongs in neither ' +
  'list). Then set verdict: "repo_wide" when the pattern holds across the held-out files ' +
  'with no contradictions, "file_local" when it is contradicted or looks like it was only ' +
  'ever an incidental single-file pattern rather than a repo convention, "inconclusive" ' +
  'when the held-out files give no signal either way. Return exactly one result per ' +
  'candidate id given, using the SAME id — never invent a new id.';

export interface VerifyConventionsInput {
  candidates: MergedCandidate[];
  /** Sample files NOT used as any candidate's own evidence — the shared verification pool. */
  heldOutFiles: { path: string; content: string }[];
  llm: LLMProvider;
  model: string;
  sessionId?: string;
  maxRetries?: number;
}

export async function verifyConventions(
  input: VerifyConventionsInput,
): Promise<VerificationResult[]> {
  if (input.candidates.length === 0) return [];

  const candidateListing = input.candidates
    .map((c) => `- id: ${c.id}\n  rule: ${c.rule}`)
    .join('\n');
  const filesBlock = input.heldOutFiles.map((f) => wrapUntrusted(f.path, f.content)).join('\n\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: `${VERIFY_SYSTEM_PROMPT}\n\n${INJECTION_GUARD}` },
    {
      role: 'user',
      content:
        `## Candidates to verify\n${wrapUntrusted('candidates', candidateListing)}\n\n` +
        `## Held-out sample files\n${filesBlock}`,
    },
  ];

  const res = await input.llm.completeStructured<VerifyConventionsOutput>({
    model: input.model,
    schema: VerifyConventionsOutput,
    schemaName: 'VerifyConventions',
    messages,
    maxRetries: input.maxRetries ?? DEFAULT_VERIFY_CONVENTIONS_MAX_RETRIES,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  // Defensive: a candidate the model forgot to verify gets an explicit
  // 'inconclusive' (zero signal) rather than vanishing from the result array —
  // callers index this 1:1 against `input.candidates` without their own
  // fallback for a missing entry.
  const byId = new Map(res.data.results.map((r) => [r.candidate_id, r]));
  return input.candidates.map(
    (c) =>
      byId.get(c.id) ?? {
        candidate_id: c.id,
        confirmed_in_files: [],
        contradicted_in_files: [],
        verdict: 'inconclusive' as const,
      },
  );
}
