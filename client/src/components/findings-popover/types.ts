import type { FindingRecord } from "@devdigest/shared";

/**
 * The read-only slice a finding preview needs.
 *
 * Deliberately a structural type, not a union: the PR list feeds it
 * `FindingPreview` (off `PrMeta`) and the PR timeline feeds it the much richer
 * `FindingRecord` (off `ReviewRecord`). Both satisfy this, so one popover
 * serves both surfaces without either side converting.
 */
export type FindingPreviewLike = Pick<
  FindingRecord,
  | "id"
  | "severity"
  | "category"
  | "title"
  | "file"
  | "start_line"
  | "end_line"
  | "confidence"
  | "rationale"
>;
