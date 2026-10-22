/* Pure helpers for the Eval Dashboard rows (SPEC-07). */
import type { EvalSetRun } from "@devdigest/shared";
import { formatPct } from "@/lib/eval-metrics";

/** Values for `dashboard.sparklineAlt`: the series length and its first / last point as percentages. */
export function sparklineAltValues(series: readonly number[]): { count: number; first: string; last: string } {
  return { count: series.length, first: formatPct(series[0]), last: formatPct(series[series.length - 1]) };
}

/** A run that has no metrics yet. */
export function isRunning(run: Pick<EvalSetRun, "status">): boolean {
  return run.status === "running";
}

/** The moment a run is shown at: finish time, or the start while it still runs. */
export function runTime(run: Pick<EvalSetRun, "finished_at" | "started_at">): string {
  return run.finished_at ?? run.started_at;
}
