import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

// SPEC-02 AC1: active only on /repos/<id>/onboarding, never on /onboarding.
describe("activeKeyFor onboarding routes", () => {
  it("marks the per-repo tour route as onboarding-tour", () => {
    expect(activeKeyFor("/repos/r1/onboarding")).toBe("onboarding-tour");
  });

  it("does not mark the Add-repository route as onboarding-tour", () => {
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
  });
});
