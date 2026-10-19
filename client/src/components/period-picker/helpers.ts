import { DAY_MS, MAX_CUSTOM_DAYS, MAX_PERIOD_MS } from "./constants";

export type Range = "1d" | "30d" | "custom";
export type UiPeriod = { from: string; to: string; range: Range };
export type CustomRangeError = "invalid" | "startAfterEnd" | "endInFuture" | "tooLong";

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
