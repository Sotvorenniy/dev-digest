import type { OnboardingTour } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { SECTION_IDS, SECTION_ORDER, type SectionKey } from "./constants";

/** "3 hours ago" style relative time (copy of the Conventions helper; routes
 *  do not import each other's internals). */
export function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;

  const diffSec = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  const diffDay = Math.round(diffHour / 24);
  return rtf.format(diffDay, "day");
}

export type GenerateErrorKind = "rateLimited" | "notIndexed" | "generic";

/** Map a failed generate mutation to the i18n `errors.<kind>` key. */
export function generateErrorKind(err: unknown): GenerateErrorKind {
  if (err instanceof ApiError) {
    if (err.status === 429) return "rateLimited";
    if (err.status === 409 || err.code === "repo_not_indexed") return "notIndexed";
  }
  return "generic";
}

/** i18n key suffix under `notes.` (e.g. "stale", "skeleton.no_api_key"). */
export type NoteKey =
  | "stale"
  | "partialIndex"
  | "truncated"
  | "churnUnavailable"
  | `skeleton.${NonNullable<OnboardingTour["skeleton_reason"]>}`;

/** One note per active condition, in display order. */
export function statusNotes(tour: OnboardingTour, isStale: boolean): NoteKey[] {
  const notes: NoteKey[] = [];
  if (isStale) notes.push("stale");
  if (tour.outcome === "skeleton" && tour.skeleton_reason) notes.push(`skeleton.${tour.skeleton_reason}`);
  if (tour.index_status === "partial") notes.push("partialIndex");
  if (tour.truncated) notes.push("truncated");
  if (!tour.churn_available) notes.push("churnUnavailable");
  return notes;
}

/** Ordered [key, anchor id] pairs for the TOC. */
export function sectionAnchors(): Array<{ key: SectionKey; id: string }> {
  return SECTION_ORDER.map((key) => ({ key, id: SECTION_IDS[key] }));
}
