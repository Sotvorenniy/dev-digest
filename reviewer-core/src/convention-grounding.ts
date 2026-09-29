import type { MergedCandidate } from './review/merge-conventions.js';

/**
 * Citation grounding for convention candidates — sibling to `grounding.ts`
 * (which stays untouched: its diff-hunk citation gate is a different shape of
 * check and is explicitly "do not touch" per `AGENTS.md`).
 *
 * A convention candidate is kept ONLY if its display evidence (a) cites a real
 * sampled file, (b) its line range (when present) fits inside that file and
 * stays short enough to be an illustrative excerpt, and (c) its snippet text
 * actually appears in that file's content. Catches a model paraphrasing or
 * inventing a citation the same way `groundFindings` catches a hallucinated
 * diff line reference. Pure — no DB/FS: `sampleFiles` is passed in as data,
 * same shape as `groundFindings(findings, diff)` receiving the diff as data.
 */

/**
 * Widest line span a convention citation may claim. Far tighter than
 * `grounding.ts`'s 200-line diff-hunk limit: a convention citation is meant to
 * be an illustrative excerpt of a whole file, not a review-sized citation.
 */
export const MAX_CONVENTION_EVIDENCE_LINE_SPAN = 60;

/** A merged candidate that passed the grounding gate. Same shape as `MergedCandidate` — grounding filters, it does not transform. */
export type GroundedConventionCandidate = MergedCandidate;

export interface ConventionGroundingResult {
  kept: GroundedConventionCandidate[];
  dropped: { candidate: MergedCandidate; reason: string }[];
}

export function groundConventionCandidates(
  candidates: MergedCandidate[],
  sampleFiles: Record<string, string>,
): ConventionGroundingResult {
  const kept: GroundedConventionCandidate[] = [];
  const dropped: { candidate: MergedCandidate; reason: string }[] = [];

  for (const candidate of candidates) {
    const evidence = candidate.displayEvidence;
    const content = sampleFiles[evidence.path];

    if (content === undefined) {
      dropped.push({
        candidate,
        reason: `evidence path '${evidence.path}' is not one of the sampled files`,
      });
      continue;
    }

    if (evidence.startLine != null && evidence.endLine != null) {
      const fileLineCount = content.split('\n').length;
      const lo = Math.min(evidence.startLine, evidence.endLine);
      const hi = Math.max(evidence.startLine, evidence.endLine);
      if (lo < 1 || hi > fileLineCount) {
        dropped.push({
          candidate,
          reason: `lines ${evidence.startLine}-${evidence.endLine} are out of range for '${evidence.path}' (${fileLineCount} lines)`,
        });
        continue;
      }
      if (hi - lo + 1 > MAX_CONVENTION_EVIDENCE_LINE_SPAN) {
        dropped.push({
          candidate,
          reason: `lines ${evidence.startLine}-${evidence.endLine} span ${hi - lo + 1} lines, over the ${MAX_CONVENTION_EVIDENCE_LINE_SPAN}-line limit for a convention citation in '${evidence.path}'`,
        });
        continue;
      }
    }

    const snippet = evidence.snippet.trim();
    if (snippet.length === 0 || !content.includes(snippet)) {
      dropped.push({
        candidate,
        reason: `evidence snippet does not appear verbatim in '${evidence.path}' (fabricated or paraphrased)`,
      });
      continue;
    }

    kept.push(candidate);
  }

  return { kept, dropped };
}

/** Human-readable summary, e.g. "3/4 passed" — same idiom as `groundingSummary` in `grounding.ts`. */
export function conventionGroundingSummary(result: ConventionGroundingResult): string {
  const total = result.kept.length + result.dropped.length;
  return `${result.kept.length}/${total} passed`;
}
