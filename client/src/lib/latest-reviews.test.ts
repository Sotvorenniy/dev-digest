import { describe, it, expect } from "vitest";
import type { ReviewRecord } from "@devdigest/shared";
import { latestReviewPerAgent } from "./latest-reviews";

/** Reviews arrive newest-first, as GET /pulls/:id/reviews returns them. */
function review(id: string, agentId: string | null, findings = 1): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
    agent_id: agentId,
    run_id: `run-${id}`,
    agent_name: agentId,
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 80,
    model: "test",
    grounding: null,
    created_at: "2026-09-27T10:00:00.000Z",
    findings: Array.from({ length: findings }, (_, i) => ({
      id: `${id}-f${i}`,
      severity: "CRITICAL",
      category: "security",
      title: "Finding",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      rationale: "because",
      suggestion: null,
      confidence: 0.9,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      review_id: id,
      accepted_at: null,
      dismissed_at: null,
    })),
  };
}

describe("latestReviewPerAgent", () => {
  it("keeps only an agent's newest review, so a re-run replaces it", () => {
    const kept = latestReviewPerAgent([review("r-new", "sec"), review("r-old", "sec")]);
    expect(kept.map((r) => r.id)).toEqual(["r-new"]);
  });

  it("keeps one review per agent when several reviewed in parallel", () => {
    const kept = latestReviewPerAgent([
      review("r-perf", "perf"),
      review("r-sec", "sec"),
      review("r-gen", "gen"),
    ]);
    expect(kept).toHaveLength(3);
  });

  it("keeps every unattributed review — a null agent cannot be superseded", () => {
    const kept = latestReviewPerAgent([review("r-a", null), review("r-b", null)]);
    expect(kept.map((r) => r.id)).toEqual(["r-a", "r-b"]);
  });

  it("makes the badge count the current findings, not every finding ever", () => {
    // Security ran twice, 1 critical each; the badge must read 1, not 2.
    const reviews = [review("r-new", "sec"), review("r-old", "sec")];
    const count = latestReviewPerAgent(reviews).flatMap((r) => r.findings).length;
    expect(count).toBe(1);
    // …while the full list still holds both runs for the accordion history.
    expect(reviews).toHaveLength(2);
  });

  it("preserves newest-first order and does not mutate its input", () => {
    const reviews = [review("r-sec", "sec"), review("r-perf", "perf")];
    expect(latestReviewPerAgent(reviews).map((r) => r.id)).toEqual(["r-sec", "r-perf"]);
    expect(reviews.map((r) => r.id)).toEqual(["r-sec", "r-perf"]);
  });

  it("returns nothing for a PR with no reviews", () => {
    expect(latestReviewPerAgent([])).toEqual([]);
  });
});
