import type { SeverityCounts } from "./constants";

/**
 * Tally anything that carries a severity — a plain count over data already in
 * hand. Both the run accordion's counter pills and the timeline's chips derive
 * from this, so neither opening a run nor toggling a filter costs a request,
 * let alone a model call.
 */
export function countBySeverity<T extends { severity: string }>(items: T[]): SeverityCounts {
  const counts: SeverityCounts = {};
  for (const it of items) counts[it.severity] = (counts[it.severity] ?? 0) + 1;
  return counts;
}
