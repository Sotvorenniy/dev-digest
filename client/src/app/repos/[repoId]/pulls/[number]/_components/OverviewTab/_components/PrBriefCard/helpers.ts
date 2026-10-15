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

/** Link into the Files changed tab at a line, or null when the line is not a usable anchor. */
export function reviewFocusHref(
  repoId: string,
  prNumber: number,
  file: string,
  line: number | null | undefined,
): string | null {
  if (typeof line !== "number" || !Number.isInteger(line) || line < 1) return null;
  const qs = new URLSearchParams({ tab: "diff", file, line: String(line) });
  return `/repos/${encodeURIComponent(repoId)}/pulls/${prNumber}?${qs.toString()}`;
}
