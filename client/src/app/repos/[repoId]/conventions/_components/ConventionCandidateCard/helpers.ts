import type { ConventionCandidate } from "@devdigest/shared";

/** `path` or `path:start-end` for the evidence header — matches the mockup's
 *  file:line-range label, falling back to just the path when no range was
 *  captured for this candidate. */
export function formatEvidenceLocation(candidate: Pick<
  ConventionCandidate,
  "evidence_path" | "evidence_start_line" | "evidence_end_line"
>): string {
  if (candidate.evidence_start_line == null) return candidate.evidence_path;
  const end = candidate.evidence_end_line ?? candidate.evidence_start_line;
  return `${candidate.evidence_path}:${candidate.evidence_start_line}-${end}`;
}
