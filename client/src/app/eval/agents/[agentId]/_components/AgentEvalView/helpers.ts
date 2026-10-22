/* Pure helpers for the per-agent eval page (SPEC-07). */
import { ApiError } from "@/lib/api";
import type { EvalMetricPoint } from "@/lib/types";

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

export type TrendSeriesKey = "recall" | "precision" | "citation";

/** One plotted value list per metric; null points are dropped per series (EC6). */
export function trendSeries(trend: readonly EvalMetricPoint[]): Record<TrendSeriesKey, number[]> {
  const pick = (f: (p: EvalMetricPoint) => number | null) =>
    trend.map(f).filter((v): v is number => v != null);
  return {
    recall: pick((p) => p.recall),
    precision: pick((p) => p.precision),
    citation: pick((p) => p.citation_accuracy),
  };
}
