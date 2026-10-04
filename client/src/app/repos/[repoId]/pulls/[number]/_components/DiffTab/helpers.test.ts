import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, SmartDiff } from "@devdigest/shared";
import { diffTotals, filesWithFindingsCount, findingsByPath, groupFiles } from "./helpers";

const file = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions, patch: null }) as PrFile;
const finding = (file: string) => ({ id: file, file }) as unknown as FindingRecord;
const sf = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });
const smart = (groups: SmartDiff["groups"]): SmartDiff => ({
  groups,
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
});

describe("groupFiles", () => {
  it("resolves server groups to full files, in server order", () => {
    const files = [file("a.md"), file("b.ts")];
    const g = groupFiles(files, smart([{ role: "core", files: [sf("b.ts")] }, { role: "docs", files: [sf("a.md")] }]));
    expect(g.map((x) => [x.role, x.files.map((f) => f.path)])).toEqual([
      ["core", ["b.ts"]],
      ["docs", ["a.md"]],
    ]);
  });

  it("appends files the server missed to core", () => {
    const g = groupFiles([file("a.ts"), file("lost.ts")], smart([{ role: "core", files: [sf("a.ts")] }]));
    expect(g[0]!.files.map((f) => f.path)).toEqual(["a.ts", "lost.ts"]);
  });

  it("creates a core group when none exists", () => {
    const g = groupFiles([file("lost.ts")], smart([]));
    expect(g).toHaveLength(1);
    expect(g[0]!.role).toBe("core");
  });
});

describe("counts", () => {
  it("counts FILES with findings, not findings", () => {
    const by = findingsByPath([finding("a.ts"), finding("a.ts"), finding("b.ts")]);
    expect(filesWithFindingsCount([file("a.ts"), file("b.ts"), file("c.ts")], by)).toBe(2);
  });

  it("sums additions and deletions", () => {
    expect(diffTotals([file("a", 3, 1), file("b", 2, 4)])).toEqual({ additions: 5, deletions: 5 });
  });
});
