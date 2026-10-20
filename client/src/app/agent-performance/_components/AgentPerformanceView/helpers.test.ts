import { describe, it, expect } from "vitest";
import type { AgentPerf, AgentPerfRow } from "@/lib/types";
import { customRangeToPeriod, parsePeriodQuery, periodToDateInputs, periodToSearch, presetPeriod } from "@/components/period-picker";
import { formatSignedCost } from "@/components/run-cost-badge";
import { formatDuration, formatPercent } from "@/lib/agent-metrics";
import { costDelta, sortRows, trendDirection, withPercents } from "./helpers";

const DAY = 24 * 3600 * 1000;

function row(over: Partial<AgentPerfRow> & { agent_name: string | null }): AgentPerfRow {
  return {
    agent_id: over.agent_name ?? "deleted",
    provider: "openai",
    model: "gpt",
    runs: 5,
    findings_total: 0,
    accepted: 0,
    dismissed: 0,
    pending: 0,
    decided: 20,
    unpriced_runs: 0,
    previous_decided: 20,
    previous_accept_rate: 0.5,
    accept_rate: 0.5,
    dismiss_rate: null,
    avg_findings_per_run: null,
    total_cost_usd: null,
    avg_cost_usd: null,
    avg_latency_ms: null,
    last_run_at: null,
    findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
    trend: [],
    cost_by_model: [],
    ...over,
  };
}

const q = (from: string, to: string, range?: string) => {
  const p = new URLSearchParams({ from, to });
  if (range) p.set("range", range);
  return p;
};

describe("parsePeriodQuery (AC3, EC12)", () => {
  const from = "2026-10-01T00:00:00.000Z";
  const to = "2026-10-08T00:00:00.000Z";

  it("returns the period from a valid query and keeps a known range", () => {
    expect(parsePeriodQuery(q(from, to, "30d"))).toEqual({ from, to, range: "30d" });
  });
  it("turns an unknown or missing range into custom", () => {
    expect(parsePeriodQuery(q(from, to, "weird"))?.range).toBe("custom");
    expect(parsePeriodQuery(q(from, to))?.range).toBe("custom");
  });
  it("returns null for missing, reversed, equal, garbage and over-long periods", () => {
    expect(parsePeriodQuery(new URLSearchParams())).toBeNull();
    expect(parsePeriodQuery(new URLSearchParams({ from }))).toBeNull();
    expect(parsePeriodQuery(q(to, from))).toBeNull();
    expect(parsePeriodQuery(q(from, from))).toBeNull();
    expect(parsePeriodQuery(q("yesterday", "<script>"))).toBeNull();
    const fromMs = Date.parse(from);
    expect(parsePeriodQuery(q(from, new Date(fromMs + 366 * DAY).toISOString()))).not.toBeNull();
    expect(parsePeriodQuery(q(from, new Date(fromMs + 366 * DAY + 1).toISOString()))).toBeNull();
  });
  it("round-trips through periodToSearch", () => {
    const p = { from, to, range: "custom" as const };
    expect(parsePeriodQuery(new URLSearchParams(periodToSearch(p)))).toEqual(p);
  });
});

describe("presetPeriod", () => {
  it("30d spans exactly 30 x 24 h ending now; 1d spans 24 h", () => {
    const now = Date.parse("2026-10-18T12:00:00.000Z");
    const p = presetPeriod("30d", now);
    expect(Date.parse(p.to) - Date.parse(p.from)).toBe(30 * DAY);
    expect(p.to).toBe(new Date(now).toISOString());
    expect(Date.parse(presetPeriod("1d", now).to) - Date.parse(presetPeriod("1d", now).from)).toBe(DAY);
  });
});

describe("customRangeToPeriod (AC4)", () => {
  const now = new Date(2026, 9, 18, 15, 30); // local time

  it("includes both days: from = start midnight, to = midnight after the end day", () => {
    const r = customRangeToPeriod("2026-10-10", "2026-10-12", now);
    expect(r).toEqual({
      period: {
        from: new Date(2026, 9, 10).toISOString(),
        to: new Date(2026, 9, 13).toISOString(),
        range: "custom",
      },
    });
  });
  it("rejects start after end, an end in the future and malformed input", () => {
    expect(customRangeToPeriod("2026-10-12", "2026-10-10", now)).toEqual({ error: "startAfterEnd" });
    expect(customRangeToPeriod("2026-10-10", "2026-10-19", now)).toEqual({ error: "endInFuture" });
    expect(customRangeToPeriod("", "2026-10-10", now)).toEqual({ error: "invalid" });
    expect(customRangeToPeriod("2026-10-10", "nope", now)).toEqual({ error: "invalid" });
  });
  it("allows 365 inclusive days and rejects 366", () => {
    // 2026-10-18 back 365 inclusive days starts 2025-10-19; 366 starts 2025-10-18
    expect("period" in customRangeToPeriod("2025-10-19", "2026-10-18", now)).toBe(true);
    expect(customRangeToPeriod("2025-10-18", "2026-10-18", now)).toEqual({ error: "tooLong" });
  });
  it("periodToDateInputs round-trips a custom period", () => {
    const r = customRangeToPeriod("2026-09-30", "2026-10-02", now);
    if (!("period" in r)) throw new Error("expected a period");
    expect(periodToDateInputs(r.period)).toEqual({ start: "2026-09-30", end: "2026-10-02" });
  });
});

describe("sortRows (AC14, AC18)", () => {
  const confidentLow = row({ agent_name: "Low", accept_rate: 0.3, decided: 12 });
  const confidentHigh = row({ agent_name: "High", accept_rate: 0.9, decided: 30 });
  const smallTop = row({ agent_name: "SmallTop", accept_rate: 1, decided: 2 });
  const smallNull = row({ agent_name: "SmallNull", accept_rate: null, decided: 0 });
  const idleB = row({ agent_name: "Bravo", runs: 0, accept_rate: null, decided: 0 });
  const idleA = row({ agent_name: "Alpha", runs: 0, accept_rate: null, decided: 0 });
  const all = [idleB, smallNull, confidentLow, smallTop, idleA, confidentHigh];

  it("desc: confident rows, then small samples (nulls last), then idle rows by name", () => {
    expect(sortRows(all, "desc").map((r) => r.agent_name)).toEqual([
      "High",
      "Low",
      "SmallTop",
      "SmallNull",
      "Alpha",
      "Bravo",
    ]);
  });
  it("asc flips the rate order inside the groups but idle rows stay last", () => {
    expect(sortRows(all, "asc").map((r) => r.agent_name)).toEqual([
      "Low",
      "High",
      "SmallTop",
      "SmallNull",
      "Alpha",
      "Bravo",
    ]);
  });
  it("breaks ties by name and does not mutate the input", () => {
    const a = row({ agent_name: "A", accept_rate: 0.5 });
    const b = row({ agent_name: "B", accept_rate: 0.5 });
    const input = [b, a];
    expect(sortRows(input, "desc").map((r) => r.agent_name)).toEqual(["A", "B"]);
    expect(input.map((r) => r.agent_name)).toEqual(["B", "A"]);
  });
  it("sorts the deleted-agent row (null name) as an empty label without throwing", () => {
    const gone = row({ agent_name: null, agent_id: null, accept_rate: 0.5 });
    const a = row({ agent_name: "A", accept_rate: 0.5 });
    expect(sortRows([a, gone], "desc").map((r) => r.agent_id)).toEqual([null, "A"]);
  });
});

describe("trendDirection (AC23)", () => {
  it("is up/down when both samples are >= 10 and the rounded rates differ", () => {
    expect(trendDirection(row({ agent_name: "a", accept_rate: 0.8, previous_accept_rate: 0.5 }))).toBe("up");
    expect(trendDirection(row({ agent_name: "a", accept_rate: 0.4, previous_accept_rate: 0.5 }))).toBe("down");
  });
  it("is null when either decided count is below 10", () => {
    expect(trendDirection(row({ agent_name: "a", decided: 9, accept_rate: 0.9 }))).toBeNull();
    expect(trendDirection(row({ agent_name: "a", previous_decided: 9, accept_rate: 0.9 }))).toBeNull();
  });
  it("is null when the rounded percentages are equal or a rate is missing", () => {
    expect(trendDirection(row({ agent_name: "a", accept_rate: 0.501, previous_accept_rate: 0.504 }))).toBeNull();
    expect(trendDirection(row({ agent_name: "a", previous_accept_rate: null }))).toBeNull();
  });
});

describe("cost helpers (AC23, EC15)", () => {
  const summary = (total: number | null, prev: number | null) =>
    ({ total_cost_usd: total, previous_total_cost_usd: prev }) as AgentPerf["summary"];

  it("costDelta is null when either total is null", () => {
    expect(costDelta(summary(null, 1))).toBeNull();
    expect(costDelta(summary(1, null))).toBeNull();
    expect(costDelta(summary(1.5, 1))).toBeCloseTo(0.5, 12);
  });
  it("formatSignedCost carries a text sign and keeps the sub-cent marker", () => {
    expect(formatSignedCost(-1.2)).toBe("−$1.20");
    expect(formatSignedCost(0.3)).toBe("+$0.30");
    expect(formatSignedCost(0.00001)).toBe("+<$0.0001");
    expect(formatSignedCost(0)).toBe("$0.00");
  });
  it("formatPercent and formatDuration render a dash for null", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0.75)).toBe("75%");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(1200)).toBe("1.2 s");
  });
  it("withPercents gives each segment its share of the sum", () => {
    const out = withPercents([
      { label: "a", value: 3, kind: "model" },
      { label: "b", value: 1, kind: "model" },
    ]);
    expect(out.map((x) => x.percent)).toEqual(["75%", "25%"]);
  });
});
