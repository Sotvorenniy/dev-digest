import { describe, it, expect } from "vitest";
import { hunkFromTexts, parseExpected, withSkeleton } from "./helpers";

describe("hunkFromTexts", () => {
  it("an empty before is a new file: one added hunk, no file headers", () => {
    expect(hunkFromTexts("", "const a = 1;\nconst b = 2;")).toBe("@@ -0,0 +1,2 @@\n+const a = 1;\n+const b = 2;");
  });

  it("a modified file has context, removed and added lines and no headers or EOF marker", () => {
    const patch = hunkFromTexts("keep\nold line\ntail", "keep\nnew line\ntail");
    expect(patch.startsWith("@@")).toBe(true);
    expect(patch).toContain("-old line");
    expect(patch).toContain("+new line");
    expect(patch).toContain(" keep");
    expect(patch.split("\n")[0]).toMatch(/^@@/);
    expect(patch).not.toContain("Index:");
    expect(patch).not.toContain("No newline");
  });

  it("treats CRLF and LF text as the same lines", () => {
    expect(hunkFromTexts("a\r\nb\r\n", "a\nb\n")).toBe("");
    const patch = hunkFromTexts("a\r\nold\r\n", "a\nnew\n");
    expect(patch).toContain("-old");
    expect(patch).toContain("+new");
    expect(patch).not.toContain("\r");
  });

  it("a before without a trailing newline and an after with one is not a change", () => {
    expect(hunkFromTexts("same", "same\n")).toBe("");
  });

  it("an empty after deletes every line", () => {
    expect(hunkFromTexts("gone\nalso gone", "")).toBe("@@ -1,2 +0,0 @@\n-gone\n-also gone");
  });

  it("identical or empty texts give no hunk", () => {
    expect(hunkFromTexts("same", "same")).toBe("");
    expect(hunkFromTexts("", "")).toBe("");
  });
});

describe("withSkeleton", () => {
  it("appends one template item and keeps the type", () => {
    const next = JSON.parse(withSkeleton(JSON.stringify({ type: "must_not_flag", items: [] }))!);
    expect(next.type).toBe("must_not_flag");
    expect(next.items).toHaveLength(1);
  });
  it("returns null for invalid JSON", () => {
    expect(withSkeleton("{ nope")).toBeNull();
  });
});

describe("parseExpected", () => {
  it("reads the object form", () => {
    expect(parseExpected('{"type":"must_find","items":[]}')).toEqual({ type: "must_find", items: [] });
  });
  it("reads [] as a clean-diff case: must_not_flag with no items", () => {
    expect(parseExpected("[]")).toEqual({ type: "must_not_flag", items: [] });
    expect(parseExpected("  [ ]  ")).toEqual({ type: "must_not_flag", items: [] });
  });
  it("rejects a non-empty array, an unknown type and broken JSON", () => {
    expect(parseExpected('[{"file":"a.ts"}]')).toBeNull();
    expect(parseExpected('{"type":"nope","items":[]}')).toBeNull();
    expect(parseExpected("{ nope")).toBeNull();
  });
});
