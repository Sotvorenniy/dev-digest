import type { SmartDiffRole } from "@devdigest/shared";

/** Per-role presentation: dot colour + i18n keys under `prReview.smartDiff`. */
export const ROLE_META: Record<SmartDiffRole, { color: string; label: string; description: string }> = {
  core: { color: "var(--accent)", label: "coreLabel", description: "coreDescription" },
  tests: { color: "var(--ok)", label: "testsLabel", description: "testsDescription" },
  wiring: { color: "var(--warn)", label: "wiringLabel", description: "wiringDescription" },
  docs: { color: "var(--info)", label: "docsLabel", description: "docsDescription" },
  boilerplate: { color: "var(--text-muted)", label: "boilerplateLabel", description: "boilerplateDescription" },
};

/** Groups that start collapsed — the reviewer skims these last. */
export const COLLAPSED_BY_DEFAULT: ReadonlySet<SmartDiffRole> = new Set<SmartDiffRole>(["docs", "boilerplate"]);
