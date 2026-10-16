import { describe, it, expect } from "vitest";
import type { OnboardingTour } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { generateErrorKind, statusNotes } from "./helpers";

function tour(over: Partial<OnboardingTour> = {}): OnboardingTour {
  return {
    generated_at: "2026-10-14T10:00:00.000Z",
    indexed_sha: "abc",
    files_indexed: 10,
    index_status: "full",
    outcome: "ai",
    skeleton_reason: null,
    churn_available: true,
    truncated: false,
    dropped_paths: 0,
    model: "m",
    llm_calls: 1,
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: null,
    sections: {
      architecture: { summary: "s", nodes: [], edges: [] },
      critical_paths: [],
      run_locally: [],
      reading_path: [],
      first_tasks: [],
    },
    ...over,
  };
}

// SPEC-02 AC13: one note per true condition.
describe("statusNotes", () => {
  it("returns no notes when no condition is true", () => {
    expect(statusNotes(tour(), false)).toEqual([]);
  });

  it("returns churnUnavailable when churn_available is false", () => {
    expect(statusNotes(tour({ churn_available: false }), false)).toEqual(["churnUnavailable"]);
  });

  it("returns one note each for stale, partial, truncated", () => {
    expect(statusNotes(tour({ index_status: "partial" }), false)).toEqual(["partialIndex"]);
    expect(statusNotes(tour({ truncated: true }), false)).toEqual(["truncated"]);
    expect(statusNotes(tour(), true)).toEqual(["stale"]);
  });

  it.each(["index_degraded", "index_failed", "no_api_key", "ai_failed"] as const)(
    "returns skeleton.%s for a skeleton with that reason",
    (reason) => {
      expect(statusNotes(tour({ outcome: "skeleton", skeleton_reason: reason }), false)).toEqual([
        `skeleton.${reason}`,
      ]);
    },
  );

  it("returns every note when every condition is true", () => {
    const notes = statusNotes(
      tour({ outcome: "skeleton", skeleton_reason: "ai_failed", index_status: "partial", truncated: true, churn_available: false }),
      true,
    );
    expect([...notes].sort()).toEqual(["churnUnavailable", "partialIndex", "skeleton.ai_failed", "stale", "truncated"]);
  });
});

// SPEC-02 AC16: 429 / 409 repo_not_indexed / anything else.
describe("generateErrorKind", () => {
  it("maps 429 to rateLimited", () => {
    expect(generateErrorKind(new ApiError("x", 429))).toBe("rateLimited");
  });
  it("maps 409 repo_not_indexed to notIndexed", () => {
    expect(generateErrorKind(new ApiError("x", 409, "repo_not_indexed"))).toBe("notIndexed");
  });
  it("maps 500 and non-ApiError values to generic", () => {
    expect(generateErrorKind(new ApiError("x", 500))).toBe("generic");
    expect(generateErrorKind(new Error("network"))).toBe("generic");
  });
});
