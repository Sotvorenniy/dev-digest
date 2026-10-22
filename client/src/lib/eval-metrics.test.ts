import { describe, it, expect } from "vitest";
import type { EvalSetRun } from "@devdigest/shared";
import {
  deltaPoints,
  formatDeltaPoints,
  formatPct,
  latestFinished,
  orderOldNew,
  previousFinished,
} from "./eval-metrics";

const run = (id: string, status: EvalSetRun["status"]): EvalSetRun => ({
  id,
  agent_id: "a",
  agent_version: 1,
  model: "m",
  strategy: "auto",
  status,
  started_at: "2026-10-01T00:00:00Z",
  finished_at: null,
  cases_total: 1,
  cases_passed: 0,
  cases_errored: 0,
  recall: null,
  precision: null,
  citation_accuracy: null,
  cost_usd: null,
  duration_ms: null,
});

describe("latestFinished / previousFinished", () => {
  it("skip running and failed runs; partial counts as finished (runs are newest first)", () => {
    const runs = [run("r-running", "running"), run("r-failed", "failed"), run("r-partial", "partial"), run("r-done", "done")];
    expect(latestFinished(runs)?.id).toBe("r-partial");
    expect(previousFinished(runs)?.id).toBe("r-done");
  });

  it("return null when there is no (second) finished run or no data", () => {
    expect(latestFinished([run("a", "running"), run("b", "failed")])).toBeNull();
    expect(previousFinished([run("a", "done")])).toBeNull();
    expect(latestFinished(undefined)).toBeNull();
    expect(previousFinished(undefined)).toBeNull();
  });
});

describe("deltaPoints / formatDeltaPoints", () => {
  it("is the signed difference in whole percentage points (x100)", () => {
    expect(deltaPoints(0.8, 0.5)).toBe(30);
    expect(deltaPoints(0.5, 0.8)).toBe(-30);
    expect(deltaPoints(0.5, 0.5)).toBe(0);
  });

  it("rounds each side to a point first so the shown numbers subtract exactly", () => {
    expect(deltaPoints(0.666, 0.333)).toBe(34); // 67 - 33, not round(33.3) = 33
  });

  it("is null when either side is null/undefined/non-finite", () => {
    expect(deltaPoints(null, 0.5)).toBeNull();
    expect(deltaPoints(0.5, undefined)).toBeNull();
    expect(deltaPoints(Number.NaN, 0.5)).toBeNull();
  });

  it("formats the sign as text and null as an em dash", () => {
    expect(formatDeltaPoints(4)).toBe("+4 pt");
    expect(formatDeltaPoints(-3)).toBe("−3 pt");
    expect(formatDeltaPoints(0)).toBe("±0 pt");
    expect(formatDeltaPoints(null)).toBe("—");
  });
});

describe("formatPct / orderOldNew", () => {
  it("formats fractions as rounded percent and null as an em dash", () => {
    expect(formatPct(0.756)).toBe("76%");
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(null)).toBe("—");
    expect(formatPct(undefined)).toBe("—");
  });

  it("orders a pair oldest first by started_at regardless of input order", () => {
    const a = { started_at: "2026-10-02T00:00:00Z", id: "new" };
    const b = { started_at: "2026-10-01T00:00:00Z", id: "old" };
    expect(orderOldNew(a, b).map((r) => r.id)).toEqual(["old", "new"]);
    expect(orderOldNew(b, a).map((r) => r.id)).toEqual(["old", "new"]);
  });
});
