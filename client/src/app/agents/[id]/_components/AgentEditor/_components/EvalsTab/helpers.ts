import type { EvalCase, EvalSetRun } from "@devdigest/shared";

export function passingCount(cases: readonly EvalCase[]): number {
  return cases.filter((c) => c.last_status === "pass").length;
}

/** A finished run with errored cases (AC13). */
export function erroredCases(run: EvalSetRun | undefined): number {
  return run && (run.status === "partial" || run.status === "failed") ? run.cases_errored : 0;
}
