import { describe, it, expect } from "vitest";
import type { SkillVersion } from "@devdigest/shared";
import { currentVersionOf, diffAgainstCurrent, sortedByVersionDesc } from "./helpers";

function version(v: Partial<SkillVersion> & Pick<SkillVersion, "version">): SkillVersion {
  return {
    skill_id: "sk1",
    body: "",
    change_note: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...v,
  };
}

describe("currentVersionOf", () => {
  it("returns the row with the highest version number, not the last in the array", () => {
    const versions = [version({ version: 3 }), version({ version: 1 }), version({ version: 2 })];
    expect(currentVersionOf(versions)?.version).toBe(3);
  });

  it("returns null for an empty list", () => {
    expect(currentVersionOf([])).toBeNull();
  });
});

describe("sortedByVersionDesc", () => {
  it("sorts newest first without mutating the input", () => {
    const versions = [version({ version: 1 }), version({ version: 3 }), version({ version: 2 })];
    const sorted = sortedByVersionDesc(versions);
    expect(sorted.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions.map((v) => v.version)).toEqual([1, 3, 2]);
  });
});

describe("diffAgainstCurrent", () => {
  it("strips the file-header lines so only real +/- content lines are counted", () => {
    const { patch, additions, deletions } = diffAgainstCurrent(
      "v1",
      "v2",
      "# Rule\nOld line\n",
      "# Rule\nNew line\nExtra line\n",
    );
    expect(patch).not.toContain("---");
    expect(patch).not.toContain("+++");
    expect(patch.startsWith("@@")).toBe(true);
    expect(additions).toBe(2);
    expect(deletions).toBe(1);
  });

  it("produces no hunk for identical bodies", () => {
    const { patch, additions, deletions } = diffAgainstCurrent("v1", "v2", "same\n", "same\n");
    expect(patch).toBe("");
    expect(additions).toBe(0);
    expect(deletions).toBe(0);
  });
});
