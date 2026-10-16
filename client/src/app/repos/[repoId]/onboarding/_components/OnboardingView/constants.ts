/** Section render order (also the TOC order). */
export const SECTION_ORDER = [
  "architecture",
  "criticalPaths",
  "runLocally",
  "readingPath",
  "firstTasks",
] as const;

export type SectionKey = (typeof SECTION_ORDER)[number];

/** Anchor id of each section heading. */
export const SECTION_IDS: Record<SectionKey, string> = {
  architecture: "onboarding-architecture",
  criticalPaths: "onboarding-critical-paths",
  runLocally: "onboarding-run-locally",
  readingPath: "onboarding-reading-path",
  firstTasks: "onboarding-first-tasks",
};

/** How long a copy button shows its "Copied" state. */
export const COPIED_RESET_MS = 2_000;

/** Where the "no API key" note links to. */
export const API_KEYS_HREF = "/settings/api-keys";
