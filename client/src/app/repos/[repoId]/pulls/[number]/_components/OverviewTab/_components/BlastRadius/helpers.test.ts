import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@/lib/types";
import { blastTotals, callerHref, reasonKey } from "./helpers";

const data: BlastRadius = {
  changed_symbols: [
    { name: "a", file: "src/a.ts", kind: "function" },
    { name: "b", file: "src/b.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "a",
      callers: [
        { name: "x", file: "src/x.ts", line: 1 },
        { name: "y", file: "src/y.ts", line: 2 },
      ],
      endpoints_affected: ["GET /x"],
      crons_affected: ["nightly"],
    },
    { symbol: "b", callers: [{ name: "z", file: "src/z.ts", line: 3 }], endpoints_affected: ["GET /x", "GET /z"], crons_affected: [] },
  ],
  summary: "s",
};

describe("blastTotals", () => {
  it("counts symbols, callers and de-duplicated endpoints/crons", () => {
    expect(blastTotals(data)).toEqual({ symbols: 2, callers: 3, endpoints: 2, crons: 1 });
  });
  it("is all zeros for an empty payload", () => {
    expect(blastTotals({ changed_symbols: [], downstream: [], summary: "" })).toEqual({
      symbols: 0,
      callers: 0,
      endpoints: 0,
      crons: 0,
    });
  });
});

describe("reasonKey", () => {
  it("maps every known server reason to its i18n key", () => {
    expect(reasonKey("flag_off")).toBe("flagOff");
    expect(reasonKey("index_failed")).toBe("indexFailed");
    expect(reasonKey("index_partial")).toBe("indexPartial");
    expect(reasonKey("repo_too_large")).toBe("repoTooLarge");
    expect(reasonKey("no_data")).toBe("noData");
  });
  it("falls back to unknown for absent or unrecognised reasons", () => {
    expect(reasonKey(null)).toBe("unknown");
    expect(reasonKey(undefined)).toBe("unknown");
    expect(reasonKey("toString")).toBe("unknown");
    expect(reasonKey("something_new")).toBe("unknown");
  });
});

describe("callerHref", () => {
  it("builds a GitHub blob link pinned to the head sha and line", () => {
    expect(callerHref("o/r", "abc123", "src/a b.ts", 7)).toBe("https://github.com/o/r/blob/abc123/src/a%20b.ts#L7");
  });
  it("is null without a repo or sha", () => {
    expect(callerHref(null, "abc", "a.ts", 1)).toBeNull();
    expect(callerHref("o/r", undefined, "a.ts", 1)).toBeNull();
  });
});
