import { describe, it, expect } from "vitest";
import type { AgentStats, PrMeta } from "@/lib/types";
import { estimateOf, openPulls, sumEstimates } from "./helpers";

const stats = (over: Partial<AgentStats>) => ({ runs: 3, avg_latency_ms: 2000, avg_cost_usd: 0.02, ...over }) as AgentStats;

describe("estimateOf (AC6)", () => {
  it("maps latency and cost when there is history", () => {
    expect(estimateOf(stats({}))).toEqual({ durationMs: 2000, costUsd: 0.02 });
  });
  it("is null with no stats, zero runs, or a null value — fails if 'no estimate yet' cases leak a 0", () => {
    expect(estimateOf(undefined)).toBeNull();
    expect(estimateOf(stats({ runs: 0 }))).toBeNull();
    expect(estimateOf(stats({ avg_latency_ms: null }))).toBeNull();
    expect(estimateOf(stats({ avg_cost_usd: null }))).toBeNull();
  });
});

describe("sumEstimates (AC7)", () => {
  it("counts only agents that have an estimate", () => {
    expect(
      sumEstimates([
        { durationMs: 1000, costUsd: 0.01 },
        null,
        { durationMs: 500, costUsd: 0.02 },
      ]),
    ).toEqual({ durationMs: 1500, costUsd: 0.03 });
  });
  it("is zero for an empty or all-null list", () => {
    expect(sumEstimates([null])).toEqual({ durationMs: 0, costUsd: 0 });
  });
});

describe("openPulls (AC6)", () => {
  const pr = (id: string | undefined, status: string) => ({ id, status, number: 1, title: "t" }) as unknown as PrMeta;
  it("keeps persisted open PRs and drops merged, closed and id-less ones", () => {
    const out = openPulls([pr("1", "needs_review"), pr("2", "merged"), pr("3", "closed"), pr(undefined, "needs_review")]);
    expect(out.map((p) => p.id)).toEqual(["1"]);
  });
});
