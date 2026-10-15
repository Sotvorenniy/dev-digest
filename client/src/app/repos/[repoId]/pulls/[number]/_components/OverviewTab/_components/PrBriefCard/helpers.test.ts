import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { briefErrorKind, isStale, latestVerdictInfo, reviewFocusHref } from "./helpers";

describe("reviewFocusHref", () => {
  it("links into the diff tab with file and line, URL-encoding the path", () => {
    expect(reviewFocusHref("r1", 482, "src/config.ts", 12)).toBe(
      "/repos/r1/pulls/482?tab=diff&file=src%2Fconfig.ts&line=12",
    );
  });
  it.each([0, -3, 1.5, NaN, null, undefined])("is null for the unusable line %s", (line) => {
    expect(reviewFocusHref("r1", 1, "a.ts", line as number | null | undefined)).toBeNull();
  });
});

describe("isStale", () => {
  it("is true only when both SHAs exist and differ", () => {
    expect(isStale({ head_sha: "a" }, "b")).toBe(true);
    expect(isStale({ head_sha: "a" }, "a")).toBe(false);
    expect(isStale({ head_sha: null }, "b")).toBe(false);
    expect(isStale({ head_sha: "a" }, null)).toBe(false);
    expect(isStale(null, "b")).toBe(false);
  });
});

describe("briefErrorKind", () => {
  it("maps 429 to rateLimited and config_error to noKey, anything else to generic", () => {
    expect(briefErrorKind(new ApiError("x", 429))).toBe("rateLimited");
    expect(briefErrorKind(new ApiError("x", 500, "config_error"))).toBe("noKey");
    expect(briefErrorKind(new ApiError("x", 502, "external_service_error"))).toBe("generic");
    expect(briefErrorKind(new Error("boom"))).toBe("generic");
  });
});

describe("latestVerdictInfo", () => {
  const finding = (severity: string, dismissed: string | null = null) =>
    ({ severity, dismissed_at: dismissed }) as unknown as FindingRecord;
  const review = (over: Partial<ReviewRecord>) =>
    ({ verdict: "request_changes", score: 61, findings: [], ...over }) as unknown as ReviewRecord;

  it("is null without a review or without a verdict", () => {
    expect(latestVerdictInfo(null)).toBeNull();
    expect(latestVerdictInfo(review({ verdict: null }))).toBeNull();
  });
  it("counts findings and only undismissed CRITICAL ones as blockers", () => {
    const info = latestVerdictInfo(
      review({ findings: [finding("CRITICAL"), finding("CRITICAL", "2026-01-01"), finding("WARNING")] }),
    );
    expect(info).toEqual({ verdict: "request_changes", score: 61, findingsCount: 3, blockers: 1 });
  });
});
