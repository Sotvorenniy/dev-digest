import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills, needsVetting } from "./helpers";

function skill(overrides: Partial<Skill>): Skill {
  return {
    id: "sk1",
    name: "pr-quality-rubric",
    description: "Checks PR quality",
    type: "rubric",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    agent_count: 0,
    ...overrides,
  };
}

describe("filterSkills", () => {
  it("matches case-insensitively across name and description", () => {
    const skills = [skill({ name: "Security Rubric", description: "" }), skill({ id: "sk2", name: "Style Guide" })];
    expect(filterSkills(skills, "security").map((s) => s.id)).toEqual(["sk1"]);
  });

  it("returns everything for a blank query", () => {
    const skills = [skill({}), skill({ id: "sk2" })];
    expect(filterSkills(skills, "  ")).toHaveLength(2);
  });
});

describe("needsVetting", () => {
  it("flags an imported skill that hasn't been enabled yet", () => {
    expect(needsVetting(skill({ source: "imported_url", enabled: false }))).toBe(true);
  });

  it("never flags a manual skill regardless of enabled state", () => {
    expect(needsVetting(skill({ source: "manual", enabled: false }))).toBe(false);
  });

  it("doesn't flag an imported skill once it's enabled", () => {
    expect(needsVetting(skill({ source: "community", enabled: true }))).toBe(false);
  });
});
