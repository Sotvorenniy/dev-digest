import type { ReviewRecord } from "@devdigest/shared";

/**
 * The reviews that describe a PR's CURRENT findings: the newest review of each
 * agent.
 *
 * Neither extreme is right. Taking only the newest review shows whichever agent
 * finished last, because a multi-agent review writes one review per agent
 * seconds apart. Counting every review double-counts, because a re-run adds an
 * agent's findings again instead of replacing them.
 *
 * A review with no `agent_id` keeps a bucket of its own — an unattributed
 * review cannot be shown to have been superseded, and dropping real findings is
 * worse than keeping a stale row.
 *
 * Input must be newest-first, which is how `GET /pulls/:id/reviews` returns
 * them. This mirrors `countedReviewIds` in
 * `server/src/modules/pulls/helpers.ts`, which feeds the PR list's FINDINGS
 * column; the two must agree or the list and the PR page disagree. It is a
 * second copy because `@devdigest/shared` is type-only in the client, so no
 * server code can be called from here. Note the casing differs by layer: the
 * wire contract says `agent_id`, the Drizzle row says `agentId`.
 *
 * This narrows a COUNT, never a list. The Review runs accordions and the
 * timeline still render every run — that section is a history.
 */
export function latestReviewPerAgent(reviewsNewestFirst: ReviewRecord[]): ReviewRecord[] {
  const seen = new Set<string>();
  const kept: ReviewRecord[] = [];
  for (const review of reviewsNewestFirst) {
    const key = review.agent_id ? `agent:${review.agent_id}` : `review:${review.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(review);
  }
  return kept;
}
