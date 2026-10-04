import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { findingKey, partitionFindings, worstSeverity } from "./findings";

const f = (id: string, severity: string, start_line: number) =>
  ({ id, severity, start_line }) as unknown as FindingRecord;

describe("findings helpers", () => {
  it("keys a finding on the RIGHT side of its start line", () => {
    expect(findingKey({ start_line: 12 })).toBe("RIGHT:12");
  });

  it("splits anchored findings from unanchored ones", () => {
    const { matched, unanchored } = partitionFindings(
      [f("a", "CRITICAL", 12), f("b", "WARNING", 99)],
      new Set(["RIGHT:12"]),
    );
    expect(matched.get("RIGHT:12")!.map((x) => x.id)).toEqual(["a"]);
    expect(unanchored.map((x) => x.id)).toEqual(["b"]);
  });

  it("picks the worst severity", () => {
    expect(worstSeverity([f("a", "SUGGESTION", 1), f("b", "CRITICAL", 2), f("c", "WARNING", 3)])).toBe("CRITICAL");
    expect(worstSeverity([])).toBeNull();
  });
});
