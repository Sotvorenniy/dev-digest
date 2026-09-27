/** Constants for the pulls module. */

/**
 * How much of a finding's `rationale` travels on the PR LIST payload.
 *
 * The list's FINDINGS popover carries EVERY finding of a PR's latest review —
 * capping the array would make its "N FINDINGS IN THIS RUN" header disagree
 * with the rows under it. Truncating each description instead keeps the payload
 * small without lying about the count, and the popover clamps it to two lines
 * anyway.
 */
export const PREVIEW_RATIONALE_CHARS = 220;
