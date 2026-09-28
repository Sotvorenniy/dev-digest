import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { deriveNameFromBody, extractZipCandidates } from "./helpers";

describe("deriveNameFromBody", () => {
  it("kebab-cases the first # heading", () => {
    expect(deriveNameFromBody("# PR Quality Rubric\nSome body text")).toBe("pr-quality-rubric");
  });

  it("returns null when the body has no heading", () => {
    expect(deriveNameFromBody("Just a paragraph, no heading.")).toBeNull();
  });
});

describe("extractZipCandidates", () => {
  it("extracts only markdown/text entries, ignoring everything else", async () => {
    const zip = new JSZip();
    zip.file("rule.md", "# Rule\nDo the thing.");
    zip.file("notes.txt", "plain notes");
    zip.file("image.png", new Uint8Array([1, 2, 3]));
    zip.file("script.js", "console.log('should never be read as a candidate')");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([bytes], "bundle.zip", { type: "application/zip" });

    const candidates = await extractZipCandidates(file);

    expect(candidates.map((c) => c.path).sort()).toEqual(["notes.txt", "rule.md"]);
    const rule = candidates.find((c) => c.path === "rule.md");
    expect(rule?.text).toBe("# Rule\nDo the thing.");
  });

  it("returns an empty list for an archive with no text entries", async () => {
    const zip = new JSZip();
    zip.file("image.png", new Uint8Array([1, 2, 3]));
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([bytes], "bundle.zip", { type: "application/zip" });

    expect(await extractZipCandidates(file)).toEqual([]);
  });
});
