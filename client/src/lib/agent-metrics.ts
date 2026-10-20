/* Shared by the dashboard and the agent Stats tab; SPEC-04 values. */

/** Fewer decided findings than this and an accept rate is a small sample (AC14). */
export const SMALL_SAMPLE_THRESHOLD = 10;

const DASH = "—";

export function formatPercent(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return DASH;
  return `${Math.round(rate * 100)}%`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return DASH;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Which body a metrics screen renders. `data` is narrowed on `empty` / `ready`. */
export type MetricsView<T> =
  | { state: "loading" }
  | { state: "error" }
  | { state: "empty"; data: T }
  | { state: "ready"; data: T };

/** Loading wins over error; a missing payload counts as an error. */
export function metricsView<T>(
  query: { isLoading: boolean; isError: boolean; data: T | undefined },
  isEmpty: (data: T) => boolean,
): MetricsView<T> {
  if (query.isLoading) return { state: "loading" };
  if (query.isError || query.data === undefined) return { state: "error" };
  return { state: isEmpty(query.data) ? "empty" : "ready", data: query.data };
}
