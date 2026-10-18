import { formatCost } from "@/components/run-cost-badge";
import type { AgentPerfRow, AgentPerf, PerfCostSegment } from "@/lib/types";
import { DAY_MS, HOUR_MS, MAX_CUSTOM_DAYS, MAX_PERIOD_MS, SMALL_SAMPLE_THRESHOLD } from "./constants";

export type Range = "1d" | "30d" | "custom";
export type UiPeriod = { from: string; to: string; range: Range };
export type CustomRangeError = "invalid" | "startAfterEnd" | "endInFuture" | "tooLong";

const DASH = "—";

/** A rolling preset window ending at `nowMs`. */
export function presetPeriod(range: "1d" | "30d", nowMs: number): UiPeriod {
  const span = range === "1d" ? DAY_MS : 30 * DAY_MS;
  return { from: new Date(nowMs - span).toISOString(), to: new Date(nowMs).toISOString(), range };
}

/** The period encoded in the URL, or null when absent or invalid (caller falls back to 30 days). */
export function parsePeriodQuery(params: URLSearchParams): UiPeriod | null {
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) return null;
  const f = Date.parse(from);
  const t = Date.parse(to);
  if (Number.isNaN(f) || Number.isNaN(t)) return null;
  if (f >= t || t - f > MAX_PERIOD_MS) return null;
  const r = params.get("range");
  const range: Range = r === "1d" || r === "30d" ? r : "custom";
  return { from, to, range };
}

export function periodToSearch(p: UiPeriod): string {
  return new URLSearchParams({ from: p.from, to: p.to, range: p.range }).toString();
}

function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Both days are included: `from` is local midnight of the start day, `to` local midnight after the end day. */
export function customRangeToPeriod(
  startDate: string,
  endDate: string,
  now: Date,
): { period: UiPeriod } | { error: CustomRangeError } {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end) return { error: "invalid" };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (end.getTime() > today.getTime()) return { error: "endInFuture" };
  if (start.getTime() > end.getTime()) return { error: "startAfterEnd" };
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  const days = Math.round((to.getTime() - start.getTime()) / DAY_MS);
  if (days > MAX_CUSTOM_DAYS) return { error: "tooLong" };
  return { period: { from: start.toISOString(), to: to.toISOString(), range: "custom" } };
}

/** Local YYYY-MM-DD start and end (end = the day of `to − 1 ms`) so a reload shows the same custom range. */
export function periodToDateInputs(p: UiPeriod): { start: string; end: string } {
  return {
    start: toDateInput(new Date(Date.parse(p.from))),
    end: toDateInput(new Date(Date.parse(p.to) - 1)),
  };
}

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

/** A text sign plus the cost, so direction is never colour-only. */
export function formatSignedCost(delta: number): string {
  if (delta === 0) return formatCost(0);
  return `${delta < 0 ? "−" : "+"}${formatCost(Math.abs(delta))}`;
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return DASH;
  return `${Math.round(rate * 100)}%`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return DASH;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
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
