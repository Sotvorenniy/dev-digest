import { z } from 'zod';
import type { ChatMessage, LLMProvider } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '../prompt.js';
import type { RawConventionCandidate } from './scan-conventions.js';

/**
 * Two-stage cross-batch dedup for convention candidates.
 *
 * Batched extraction (`scanConventionsBatch`) runs once per ~10-file chunk, so
 * the same convention (e.g. "always async/await") independently surfaces from
 * most batches, phrased slightly differently each time. Stage 1
 * (`clusterCandidatesByRuleSimilarity`) is a cheap deterministic pass — no LLM
 * call — that catches the obvious repeats via token-set similarity or
 * same-file/overlapping-evidence. Stage 2 (`mergeConventionCandidates`) is one
 * LLM call over just the cluster representatives to catch semantic duplicates
 * the token heuristic misses (different words, same rule).
 */

/** One piece of evidence a cluster/merged candidate carries for display or corroboration counting. */
export interface ClusterEvidence {
  path: string;
  snippet: string;
  startLine?: number | null;
  endLine?: number | null;
  confidence: number;
}

export interface CandidateCluster {
  id: string;
  /** Representative rule text — the highest-individual-confidence member's. */
  rule: string;
  /** Up to 3 distinct-file evidence entries, kept for later corroboration display. */
  evidence: ClusterEvidence[];
  /** The single highest-individual-confidence snippet — what the UI shows by default. */
  displayEvidence: ClusterEvidence;
  /** Mean of member confidences — feeds `computeConfidence`'s `meanLlmConfidence`. */
  meanLlmConfidence: number;
  /** Category of the highest-confidence member (null when the model gave none). */
  category?: string | null;
  /**
   * Count of DISTINCT evidence files across ALL members (not capped at the 3
   * kept in `evidence`) — feeds `computeConfidence`'s `corroboratingFileCount`.
   */
  corroboratingFileCount: number;
  /** All raw members, for traceability and for re-deriving evidence when clusters merge further. */
  members: RawConventionCandidate[];
}

/** Normalize rule text for token-set comparison: lowercase, strip punctuation, split on whitespace. */
function normalizeRuleTokens(rule: string): Set<string> {
  return new Set(
    rule
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

/** Jaccard similarity of two token sets (intersection / union), 1 when both are empty. */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Same file with overlapping [start, end] line ranges — a second signal the token heuristic can miss (very different phrasing, same cited lines). */
function evidenceOverlaps(a: RawConventionCandidate, b: RawConventionCandidate): boolean {
  if (a.evidence_path !== b.evidence_path) return false;
  if (a.evidence_start_line == null || a.evidence_end_line == null) return false;
  if (b.evidence_start_line == null || b.evidence_end_line == null) return false;
  const aLo = Math.min(a.evidence_start_line, a.evidence_end_line);
  const aHi = Math.max(a.evidence_start_line, a.evidence_end_line);
  const bLo = Math.min(b.evidence_start_line, b.evidence_end_line);
  const bHi = Math.max(b.evidence_start_line, b.evidence_end_line);
  return aLo <= bHi && bLo <= aHi;
}

/** Rule-text Jaccard similarity at/above this threshold is treated as "the same convention". */
const RULE_SIMILARITY_THRESHOLD = 0.6;

function toClusterEvidence(c: RawConventionCandidate): ClusterEvidence {
  return {
    path: c.evidence_path,
    snippet: c.evidence_snippet,
    startLine: c.evidence_start_line,
    endLine: c.evidence_end_line,
    confidence: c.confidence,
  };
}

/** Up to 3 distinct-file evidence entries, highest-confidence member per file first. */
function pickDisplayEvidenceSet(members: RawConventionCandidate[]): ClusterEvidence[] {
  const sorted = [...members].sort((a, b) => b.confidence - a.confidence);
  const seenPaths = new Set<string>();
  const picked: ClusterEvidence[] = [];
  for (const m of sorted) {
    if (seenPaths.has(m.evidence_path)) continue;
    seenPaths.add(m.evidence_path);
    picked.push(toClusterEvidence(m));
    if (picked.length >= 3) break;
  }
  return picked;
}

/** Category of the highest-confidence member that has one. */
function pickCategory(members: RawConventionCandidate[]): string | null {
  const sorted = [...members].sort((a, b) => b.confidence - a.confidence);
  return sorted.find((m) => m.category && m.category.trim())?.category?.trim() ?? null;
}

function buildCluster(id: string, members: RawConventionCandidate[]): CandidateCluster {
  const best = [...members].sort((a, b) => b.confidence - a.confidence)[0]!;
  const distinctFileCount = new Set(members.map((m) => m.evidence_path)).size;
  const meanLlmConfidence = members.reduce((sum, m) => sum + m.confidence, 0) / members.length;
  return {
    id,
    rule: best.rule,
    evidence: pickDisplayEvidenceSet(members),
    displayEvidence: toClusterEvidence(best),
    meanLlmConfidence,
    category: pickCategory(members),
    corroboratingFileCount: distinctFileCount,
    members,
  };
}

/**
 * Deterministic pre-merge: buckets raw candidates whose rule text is a
 * near-duplicate (Jaccard >= 0.6) OR whose evidence is the same file with
 * overlapping line ranges. Pure — no LLM call. Order of `candidates` does not
 * matter for correctness, only for which member becomes a bucket's first seed.
 */
export function clusterCandidatesByRuleSimilarity(
  candidates: RawConventionCandidate[],
): CandidateCluster[] {
  const buckets: RawConventionCandidate[][] = [];

  for (const candidate of candidates) {
    const tokens = normalizeRuleTokens(candidate.rule);
    const bucket = buckets.find((members) =>
      members.some(
        (member) =>
          jaccardSimilarity(tokens, normalizeRuleTokens(member.rule)) >= RULE_SIMILARITY_THRESHOLD ||
          evidenceOverlaps(candidate, member),
      ),
    );
    if (bucket) bucket.push(candidate);
    else buckets.push([candidate]);
  }

  return buckets.map((members, i) => buildCluster(`cluster-${i}`, members));
}

/** A cluster (or group of clusters) after the semantic merge pass. */
export interface MergedCandidate {
  id: string;
  rule: string;
  evidence: ClusterEvidence[];
  displayEvidence: ClusterEvidence;
  meanLlmConfidence: number;
  category?: string | null;
  corroboratingFileCount: number;
  /** Which input cluster ids this merged candidate absorbed (so evidence/corroboration recombine cleanly). */
  absorbedClusterIds: string[];
}

const MergedGroup = z.object({
  rule: z.string(),
  /** Cluster ids (from the input listing) this group absorbs. */
  absorbed_cluster_ids: z.array(z.string()),
});

const MergeConventionsOutput = z.object({
  merged: z.array(MergedGroup),
});
type MergeConventionsOutput = z.infer<typeof MergeConventionsOutput>;

export const DEFAULT_MERGE_CONVENTIONS_MAX_RETRIES = 2;

const MERGE_SYSTEM_PROMPT =
  'You are deduplicating a list of candidate code-style convention descriptions, ' +
  'independently extracted from different batches of files in the same repository. ' +
  'Some entries describe the SAME underlying convention in different words (e.g. ' +
  '"prefer async/await over .then() chains" and "avoid promise chains" are the same ' +
  'rule). Group entries that describe the same convention into one output group. Every ' +
  'cluster id given in the input MUST appear in exactly one output group\'s ' +
  'absorbed_cluster_ids — never invent a new id, never drop one, never place the same id ' +
  'in two groups. For each group, write ONE clear rule statement that best represents it ' +
  '(reuse the clearest existing phrasing rather than inventing new wording).';

function combineMembers(clusters: CandidateCluster[]): RawConventionCandidate[] {
  return clusters.flatMap((c) => c.members);
}

function mergedFromMembers(
  id: string,
  rule: string,
  clusters: CandidateCluster[],
): MergedCandidate {
  const members = combineMembers(clusters);
  const best = [...members].sort((a, b) => b.confidence - a.confidence)[0]!;
  const distinctFileCount = new Set(members.map((m) => m.evidence_path)).size;
  const meanLlmConfidence = members.reduce((sum, m) => sum + m.confidence, 0) / members.length;
  return {
    id,
    rule,
    evidence: pickDisplayEvidenceSet(members),
    displayEvidence: toClusterEvidence(best),
    meanLlmConfidence,
    category: pickCategory(members),
    corroboratingFileCount: distinctFileCount,
    absorbedClusterIds: clusters.map((c) => c.id),
  };
}

export interface MergeConventionCandidatesInput {
  clusters: CandidateCluster[];
  llm: LLMProvider;
  model: string;
  sessionId?: string;
  maxRetries?: number;
}

/**
 * Stage 2: one LLM call over the cluster representatives (typically 15-40
 * short rule strings) to catch semantic duplicates the deterministic pass
 * missed. Skips the LLM call entirely for 0-1 clusters — nothing to dedupe
 * against, same short-circuit shape as `reduceReviews` for a single partial.
 */
export async function mergeConventionCandidates(
  input: MergeConventionCandidatesInput,
): Promise<MergedCandidate[]> {
  const { clusters } = input;
  if (clusters.length <= 1) {
    return clusters.map((c) => mergedFromMembers(`merged-${c.id}`, c.rule, [c]));
  }

  const listing = clusters.map((c) => `- id: ${c.id}\n  rule: ${c.rule}`).join('\n');
  const messages: ChatMessage[] = [
    { role: 'system', content: `${MERGE_SYSTEM_PROMPT}\n\n${INJECTION_GUARD}` },
    { role: 'user', content: `## Candidate convention clusters\n${wrapUntrusted('clusters', listing)}` },
  ];

  const res = await input.llm.completeStructured<MergeConventionsOutput>({
    model: input.model,
    schema: MergeConventionsOutput,
    schemaName: 'MergeConventions',
    messages,
    maxRetries: input.maxRetries ?? DEFAULT_MERGE_CONVENTIONS_MAX_RETRIES,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  const byId = new Map(clusters.map((c) => [c.id, c]));
  const covered = new Set<string>();
  const merged: MergedCandidate[] = [];

  res.data.merged.forEach((group, i) => {
    const members = group.absorbed_cluster_ids
      .map((id) => byId.get(id))
      .filter((c): c is CandidateCluster => c != null && !covered.has(c.id));
    if (members.length === 0) return;
    for (const c of members) covered.add(c.id);
    merged.push(mergedFromMembers(`merged-${i}`, group.rule, members));
  });

  // Defensive: a cluster the merge pass forgot to place becomes its own
  // singleton merged candidate instead of silently vanishing — losing a real
  // extraction-stage finding to a merge-pass omission would defeat the point
  // of running a verification/grounding pass on it at all.
  for (const c of clusters) {
    if (!covered.has(c.id)) merged.push(mergedFromMembers(`merged-${c.id}`, c.rule, [c]));
  }

  return merged;
}
