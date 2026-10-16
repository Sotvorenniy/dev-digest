import { describe, it, expect } from "vitest";
import type { OnboardingState } from "@devdigest/shared";
import { onboardingRefetchInterval, ONBOARDING_POLL_MS, RESYNC_POLL_MAX_MS } from "./onboarding";

function state(over: Partial<OnboardingState> & { usable?: boolean } = {}): OnboardingState {
  const { usable = true, ...rest } = over;
  return {
    status: "none",
    job_id: null,
    index: { status: "full", usable, files_indexed: 10, last_indexed_sha: "abc" },
    is_stale: false,
    tour: null,
    ...rest,
  };
}

// SPEC-02 NFR2: polling stays far below the 120 req/min global limit.
describe("onboardingRefetchInterval", () => {
  it("polls while generating, at no more than 24 requests/min", () => {
    const ms = onboardingRefetchInterval(state({ status: "generating", job_id: "j1" }));
    expect(ms).toBe(ONBOARDING_POLL_MS);
    expect(60_000 / (ms as number)).toBeLessThanOrEqual(24);
  });

  it("does not poll without data, when none+usable, or when ready", () => {
    expect(onboardingRefetchInterval(undefined)).toBe(false);
    expect(onboardingRefetchInterval(state({ status: "none" }))).toBe(false);
    expect(onboardingRefetchInterval(state({ status: "ready" }))).toBe(false);
  });

  it("polls while a resync is pending and the index is not usable yet", () => {
    const now = 1_000_000;
    expect(
      onboardingRefetchInterval(state({ usable: false }), { resyncPendingSince: now - 5_000, now }),
    ).toBe(ONBOARDING_POLL_MS);
  });

  it("stops polling a pending resync after the 120 s bound", () => {
    const now = 1_000_000;
    expect(
      onboardingRefetchInterval(state({ usable: false }), { resyncPendingSince: now - RESYNC_POLL_MAX_MS - 1, now }),
    ).toBe(false);
  });

  it("does not poll the unusable state when no resync was triggered", () => {
    expect(onboardingRefetchInterval(state({ usable: false }), { resyncPendingSince: null })).toBe(false);
  });

  it("stops polling a pending resync once the index becomes usable", () => {
    const now = 1_000_000;
    expect(onboardingRefetchInterval(state({ usable: true }), { resyncPendingSince: now - 1_000, now })).toBe(false);
  });
});
