import { DAY_MS, HOUR_MS } from "@/components/period-picker";
import { SMALL_SAMPLE_THRESHOLD } from "@/lib/agent-metrics";
import type { AgentPerfRow, AgentPerf, PerfCostSegment } from "@/lib/types";

const DASH = "—";

/** "hour" for windows of a day or less, otherwise "day". */
export function seriesUnit(p: { from: string; to: string }): "hour" | "day" {
  return Date.parse(p.to) - Date.parse(p.from) <= DAY_MS + HOUR_MS ? "hour" : "day";
}

export function isSmallSample(decided: number): boolean {
  return decided < SMALL_SAMPLE_THRESHOLD;
}

export function rowLabelKey(row: AgentPerfRow): string {
  return row.agent_name ?? "";
}

function byName(a: AgentPerfRow, b: AgentPerfRow): number {
  return rowLabelKey(a).localeCompare(rowLabelKey(b));
}

function byRate(dir: "desc" | "asc") {
  return (a: AgentPerfRow, b: AgentPerfRow): number => {
    const ra = a.accept_rate;
    const rb = b.accept_rate;
    if (ra == null && rb == null) return byName(a, b);
    if (ra == null) return 1;
    if (rb == null) return -1;
    if (ra === rb) return byName(a, b);
    return dir === "desc" ? rb - ra : ra - rb;
  };
}

/** Three groups in order: enough decisions, small sample, then no runs. Ties break by name. */
export function sortRows(rows: AgentPerfRow[], dir: "desc" | "asc"): AgentPerfRow[] {
  const confident = rows.filter((r) => r.runs > 0 && !isSmallSample(r.decided));
  const small = rows.filter((r) => r.runs > 0 && isSmallSample(r.decided));
  const idle = rows.filter((r) => r.runs === 0);
  return [...confident.sort(byRate(dir)), ...small.sort(byRate(dir)), ...idle.sort(byName)];
}

export function trendDirection(row: AgentPerfRow): "up" | "down" | null {
  if (row.decided < SMALL_SAMPLE_THRESHOLD || row.previous_decided < SMALL_SAMPLE_THRESHOLD) return null;
  if (row.accept_rate == null || row.previous_accept_rate == null) return null;
  const now = Math.round(row.accept_rate * 100);
  const before = Math.round(row.previous_accept_rate * 100);
  if (now === before) return null;
  return now > before ? "up" : "down";
}

export function costDelta(summary: AgentPerf["summary"]): number | null {
  if (summary.total_cost_usd == null || summary.previous_total_cost_usd == null) return null;
  return summary.total_cost_usd - summary.previous_total_cost_usd;
}

/** "3 hours ago" style relative time; "—" for a missing or unparseable date. */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return DASH;
  const diffSec = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  return rtf.format(Math.round(diffHour / 24), "day");
}

/** Each segment's share of the segment sum as "NN%". */
export function withPercents(segments: PerfCostSegment[]): { segment: PerfCostSegment; percent: string }[] {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  return segments.map((segment) => ({
    segment,
    percent: total > 0 ? `${Math.round((segment.value / total) * 100)}%` : "0%",
  }));
}
