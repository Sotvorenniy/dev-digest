import { ApiError } from "@/lib/api";
import type { EvalCase, EvalSetRun } from "@devdigest/shared";
import { START_ERROR_CODES, type StartErrorKey } from "./constants";

/** Maps a failed start request to an `evalsTab.errors.*` key. 429 is `rate_limited`. */
export function startErrorKey(err: unknown): StartErrorKey {
  if (!(err instanceof ApiError)) return "generic";
  if (err.status === 429) return "rate_limited";
  const known = START_ERROR_CODES.find((c) => c === err.code);
  return known ?? "generic";
}

export function passingCount(cases: readonly EvalCase[]): number {
  return cases.filter((c) => c.last_status === "pass").length;
}

/** The newest run is the only one that can be in flight. */
export function isRunning(runs: readonly EvalSetRun[] | undefined): boolean {
  return runs?.[0]?.status === "running";
}

/** A finished run with errored cases (AC13). */
export function erroredCases(run: EvalSetRun | undefined): number {
  return run && (run.status === "partial" || run.status === "failed") ? run.cases_errored : 0;
}
