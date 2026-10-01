import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { applyLinkedOrder, isReorderable, reorderLinked } from "./helpers";

const sk = (id: string, enabled = true): Skill => ({
  id,
  name: id,
  description: "",
  type: "custom",
  source: "manual",
  body: "",
  enabled,
  version: 1,
  agent_count: 0,
});

describe("reorderLinked", () => {
  const skills = [sk("a"), sk("b"), sk("c", false), sk("d"), sk("e")];
  const linked = ["a", "b", "c", "d"];

  it("moves a dragged skill onto another attached one", () => {
    expect(reorderLinked(linked, skills, "a", "b")).toEqual(["b", "a", "c", "d"]);
    expect(reorderLinked(linked, skills, "d", "a")).toEqual(["d", "a", "b", "c"]);
  });

  it("refuses when the source or target is unattached, or the same row", () => {
    expect(reorderLinked(linked, skills, "e", "a")).toBeNull();
    expect(reorderLinked(linked, skills, "a", "a")).toBeNull();
  });

  it("isReorderable needs the skill to be attached", () => {
    expect(isReorderable(sk("a"), linked)).toBe(true);
    expect(isReorderable(sk("c", false), linked)).toBe(true);
    expect(isReorderable(sk("e"), linked)).toBe(false);
  });
});

describe("applyLinkedOrder", () => {
  it("re-seats linked ids into their existing slots and leaves unlinked rows in place", () => {
    expect(applyLinkedOrder(["a", "x", "b", "y"], ["b", "a"])).toEqual(["b", "x", "a", "y"]);
  });
});
