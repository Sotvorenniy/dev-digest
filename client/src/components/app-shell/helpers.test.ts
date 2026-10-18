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

// SPEC-04 AC1: /agent-performance has its own key and does not collide with /agents.
describe("activeKeyFor agent performance", () => {
  it("maps /agent-performance to its own key", () => {
    expect(activeKeyFor("/agent-performance")).toBe("agent-performance");
    expect(activeKeyFor("/agent-performance?from=x&to=y")).toBe("agent-performance");
  });

  it("keeps /agents on the agents key", () => {
    expect(activeKeyFor("/agents")).toBe("agents");
    expect(activeKeyFor("/agents/a1")).toBe("agents");
  });
});
