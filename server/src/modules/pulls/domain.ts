/**
 * Pulls-module domain rules (pure — no DB, no framework). Shared with other
 * modules through this file (cross-module imports may only target domain/ports/types).
 */

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
