import type { FindingPreview } from '@devdigest/shared';
import { PREVIEW_RATIONALE_CHARS } from './constants.js';

/**
 * Pulls-module helpers (pure — no DB / `this`, so they unit-test cleanly).
 */

/** Sort weight per severity (lower = shown first). Mirrors the reviewer-core gate order. */
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** A findings row as the PR-list query selects it. */
export interface FindingPreviewRow {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  rationale: string;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/**
 * Findings of ONE review, shaped for the PR list's hover popover: worst first,
 * most-confident first within a severity, each description truncated.
 *
 * Every input row comes back. The popover counts this array to render its
 * header, so dropping rows here would print a number nothing backs up.
 */
export function buildFindingPreviews(rows: FindingPreviewRow[]): FindingPreview[] {
  return [...rows]
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
        b.confidence - a.confidence,
    )
    .map((r) => ({
      id: r.id,
      severity: r.severity as FindingPreview['severity'],
      category: r.category as FindingPreview['category'],
      title: r.title,
      file: r.file,
      start_line: r.startLine,
      end_line: r.endLine,
      confidence: r.confidence,
      rationale: truncate(r.rationale, PREVIEW_RATIONALE_CHARS),
    }));
}

/** A review row as the PR-list query selects it. */
export interface ReviewRollupRow {
  id: string;
  prId: string;
  agentId: string | null;
}

/**
 * Review ids that count toward a PR's FINDINGS breakdown: the newest review of
 * each agent.
 *
 * Neither extreme is right. Taking only the newest review overall shows
 * whichever agent happened to finish last, because a multi-agent review writes
 * ONE review PER AGENT seconds apart. Summing every review double-counts: a
 * re-run adds an agent's findings again instead of replacing them. The newest
 * per agent is the PR's current state.
 *
 * A review with no `agentId` keeps a bucket of its own rather than sharing one.
 * An unattributed review cannot be shown to have been superseded, and dropping
 * real findings is worse than keeping a stale row — the seeded review on PR
 * #482 is exactly this case (`db/seed.ts` inserts it with no agent).
 *
 * Input must be newest-first; the caller orders by `createdAt desc, id desc`.
 * The client mirrors this rule in `client/src/lib/latest-reviews.ts` — it
 * cannot call this one, because `@devdigest/shared` is type-only over there.
 */
export function countedReviewIds(reviewsNewestFirst: ReviewRollupRow[]): Set<string> {
  const counted = new Set<string>();
  const seen = new Set<string>();
  for (const rv of reviewsNewestFirst) {
    const key = rv.agentId ? `${rv.prId}::${rv.agentId}` : `${rv.prId}::review:${rv.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counted.add(rv.id);
  }
  return counted;
}
