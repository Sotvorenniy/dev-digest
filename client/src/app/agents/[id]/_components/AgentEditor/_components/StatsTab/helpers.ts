import type { AgentStats } from "@/lib/types";
import { SMALL_SAMPLE_THRESHOLD } from "@/lib/agent-metrics";
import type { UiPeriod } from "@/components/period-picker";
import { CATEGORY_ORDER, HOURLY_BUCKET_MAX_MS, type FindingsByCategory } from "./constants";

type SeverityBucketPoint = AgentStats["findings_by_severity_series"][number];

const MINUS = "−";

export type PeriodLabelParts =
  | { kind: "preset"; range: "1d" | "30d"; from: string }
  | { kind: "custom"; start: string; end: string };

const SHORT_DATE = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

export function formatShortDate(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "—" : SHORT_DATE.format(new Date(ms));
}

/** Preset: the `MMM d` of `from`; custom: start and end (end = `to − 1 ms`, the last included day). */
export function periodLabelParts(period: UiPeriod): PeriodLabelParts {
  if (period.range === "1d" || period.range === "30d") {
    return { kind: "preset", range: period.range, from: formatShortDate(period.from) };
  }
  return { kind: "custom", start: formatShortDate(period.from), end: formatShortDate(new Date(Date.parse(period.to) - 1).toISOString()) };
}

/** "hour" for windows of 48 h or less, otherwise "day". */
export function runsUnit(period: { from: string; to: string }): "hour" | "day" {
  return Date.parse(period.to) - Date.parse(period.from) <= HOURLY_BUCKET_MAX_MS ? "hour" : "day";
}

export function isSmallSample(n: number): boolean {
  return n < SMALL_SAMPLE_THRESHOLD;
}

/** A text sign so direction is never colour-only. */
export function signed(n: number): string {
  if (n === 0) return "0";
  return `${n < 0 ? MINUS : "+"}${Math.abs(n)}`;
}

/** Every delta needs a previous period that had runs (AC13, EC4). */
export function runsDelta(stats: AgentStats): number | null {
  if (stats.previous_runs === 0) return null;
  return stats.runs - stats.previous_runs;
}

export function costDelta(stats: AgentStats): number | null {
  if (stats.previous_runs === 0) return null;
  if (stats.avg_cost_usd == null || stats.previous_avg_cost_usd == null) return null;
  return stats.avg_cost_usd - stats.previous_avg_cost_usd;
}

export function durationDelta(stats: AgentStats): number | null {
  if (stats.previous_runs === 0) return null;
  if (stats.avg_latency_ms == null || stats.previous_avg_latency_ms == null) return null;
  return stats.avg_latency_ms - stats.previous_avg_latency_ms;
}

/** Accept-rate change in whole percentage points; null on a small sample on either side. */
export function acceptDeltaPoints(stats: AgentStats): number | null {
  if (stats.previous_runs === 0) return null;
  if (isSmallSample(stats.decided) || isSmallSample(stats.previous_decided)) return null;
  if (stats.accept_rate == null || stats.previous_accept_rate == null) return null;
  return Math.round(stats.accept_rate * 100) - Math.round(stats.previous_accept_rate * 100);
}

/** `W1..Wn` for week buckets, otherwise the local `MMM d` of each bucket start. */
export function severityLabels(
  series: SeverityBucketPoint[],
  bucket: "day" | "week",
  weekLabel: (n: number) => string,
): string[] {
  return series.map((p, i) => (bucket === "week" ? weekLabel(i + 1) : formatShortDate(p.label)));
}

export function severityTotal(stats: AgentStats): number {
  const { CRITICAL, WARNING, SUGGESTION } = stats.findings_by_severity;
  return CRITICAL + WARNING + SUGGESTION;
}

export interface CategoryLegendRow {
  category: keyof FindingsByCategory;
  count: number;
  /** Whole percent of `total`, only when count > 0. */
  percent: number | null;
}

/** Five fixed rows plus `other` when above 0. */
export function categoryLegend(byCategory: FindingsByCategory, total: number): CategoryLegendRow[] {
  return CATEGORY_ORDER.filter((c) => c !== "other" || byCategory.other > 0).map((category) => {
    const count = byCategory[category];
    return { category, count, percent: count > 0 && total > 0 ? Math.round((count / total) * 100) : null };
  });
}
