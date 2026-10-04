import type { IntentSource } from "@/lib/types";
import { HIGH_CONFIDENCE, MEDIUM_CONFIDENCE } from "./constants";

export type ConfidenceLevel = "high" | "medium" | "low";

export function confidenceLevel(confidence: number | null | undefined): ConfidenceLevel {
  const c = confidence ?? 0;
  if (c >= HIGH_CONFIDENCE) return "high";
  if (c >= MEDIUM_CONFIDENCE) return "medium";
  return "low";
}

/** A plan/spec link exists but its text was not read, so conformance cannot be claimed. */
export function hasUnfetchedSpec(sources: IntentSource[] | null | undefined): boolean {
  return (sources ?? []).some((x) => (x.kind === "plan" || x.kind === "spec") && !x.fetched);
}
