import { describe, it, expect } from "vitest";
import type { AgentColumn, Conflict } from "@/lib/types";
import { cellFor, headerTotals, parseAgentsParam, visibleConflicts } from "./helpers";

const col = (over: Partial<AgentColumn>) => ({ duration_ms: null, cost_usd: null, ...over }) as AgentColumn;
const conflict = (key: string, is_conflict: boolean, agents: string[] = []) =>
  ({ group_key: key, is_conflict, takes: agents.map((agent_id) => ({ agent_id, verdict: "WARNING", persona: "p", note: "" })) }) as unknown as Conflict;

describe("parseAgentsParam (AC9)", () => {
  it("keeps URL order and drops empties — fails if ids are sorted or blanks kept", () => {
    expect(parseAgentsParam("b,,a,")).toEqual(["b", "a"]);
    expect(parseAgentsParam(null)).toEqual([]);
    expect(parseAgentsParam("")).toEqual([]);
  });
});

describe("headerTotals (AC10, EC16)", () => {
  it("sums durations and only the known costs", () => {
    const t = headerTotals([col({ duration_ms: 1000, cost_usd: 0.01 }), col({ duration_ms: 500, cost_usd: null }), col({})]);
    expect(t).toEqual({ durationMs: 1500, costUsd: 0.01 });
  });
  it("cost is null when no column has one — fails if it becomes 0", () => {
    expect(headerTotals([col({ duration_ms: 5 })]).costUsd).toBeNull();
  });
});

describe("visibleConflicts / cellFor (AC15)", () => {
  const list = [conflict("a", true), conflict("b", false), conflict("c", true)];
  it("filters to is_conflict only when the toggle is on", () => {
    expect(visibleConflicts(list, false)).toHaveLength(3);
    expect(visibleConflicts(list, true).map((c) => c.group_key)).toEqual(["a", "c"]);
  });
  it("finds the take of an agent, undefined when it has none", () => {
    const c = conflict("a", true, ["x"]);
    expect(cellFor(c, "x")?.agent_id).toBe("x");
    expect(cellFor(c, "y")).toBeUndefined();
  });
});
