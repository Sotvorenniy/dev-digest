/* Pure helpers for the eval metric cards, run history and Compare (SPEC-06). */
import type { EvalSetRun } from "@devdigest/shared";

const DASH = "—";
const MINUS = "−";

/** A run whose metrics are meaningful: finished, possibly with errored cases. */
export function isFinished(run: EvalSetRun): boolean {
  return run.status === "done" || run.status === "partial";
}

/** `runs` is newest first (server order). */
export function latestFinished(runs: readonly EvalSetRun[] | undefined): EvalSetRun | null {
  return (runs ?? []).find(isFinished) ?? null;
}

export function previousFinished(runs: readonly EvalSetRun[] | undefined): EvalSetRun | null {
  return (runs ?? []).filter(isFinished)[1] ?? null;
}

export function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${Math.round(v * 100)}%`;
}

/** Percentage-point change; null when either side is missing. */
export function deltaPoints(newV: number | null | undefined, oldV: number | null | undefined): number | null {
  if (newV == null || oldV == null || !Number.isFinite(newV) || !Number.isFinite(oldV)) return null;
  return Math.round(newV * 100) - Math.round(oldV * 100);
}

/** "+4 pt" / "−3 pt" / "±0 pt" — the sign is text, never colour only. */
export function formatDeltaPoints(d: number | null): string {
  if (d == null) return DASH;
  if (d === 0) return "±0 pt";
  return `${d < 0 ? MINUS : "+"}${Math.abs(d)} pt`;
}

/** Orders a pair of runs oldest first by `started_at`. */
export function orderOldNew<T extends { started_at: string }>(a: T, b: T): [T, T] {
  return Date.parse(a.started_at) <= Date.parse(b.started_at) ? [a, b] : [b, a];
}
