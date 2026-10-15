import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import type { PrBrief } from "@/lib/types";

export type BriefErrorKind = "rateLimited" | "noKey" | "generic";

/** A brief is stale when it was built for a different head commit than the PR has now. */
export function isStale(
  brief: Pick<PrBrief, "head_sha"> | null | undefined,
  headSha: string | null | undefined,
): boolean {
  return !!brief?.head_sha && !!headSha && brief.head_sha !== headSha;
}

export function briefErrorKind(err: unknown): BriefErrorKind {
  if (err instanceof ApiError) {
    if (err.status === 429) return "rateLimited";
    if (err.code === "config_error") return "noKey";
  }
  return "generic";
}

export interface VerdictInfo {
  verdict: Verdict;
  score: number | null;
  findingsCount: number;
  blockers: number;
}

/** Banner data from a review; null when there is no review or it has no verdict. Blockers = undismissed CRITICAL findings. */
export function latestVerdictInfo(review: ReviewRecord | null | undefined): VerdictInfo | null {
  if (!review || !review.verdict) return null;
  return {
    verdict: review.verdict,
    score: review.score,
    findingsCount: review.findings.length,
    blockers: review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
  };
}

/**
 * Link into the Files changed tab for a file. The line is added only when it is a
 * usable anchor (a positive integer); otherwise the link opens the file alone.
 */
export function reviewFocusHref(
  repoId: string,
  prNumber: number,
  file: string,
  line?: number | null,
): string {
  const params: Record<string, string> = { tab: "diff", file };
  if (typeof line === "number" && Number.isInteger(line) && line >= 1) params.line = String(line);
  const qs = new URLSearchParams(params);
  return `/repos/${encodeURIComponent(repoId)}/pulls/${prNumber}?${qs.toString()}`;
}

/** Splits a risk file ref `path[:N[-M]]` into the path and its first line, if any. */
export function parseFileRef(ref: string): { file: string; line: number | null } {
  const m = /^(.*?):(\d+)(?:-\d+)?$/.exec(ref);
  if (!m) return { file: ref, line: null };
  const n = Number(m[2]);
  return { file: m[1]!, line: n > 0 ? n : null };
}
