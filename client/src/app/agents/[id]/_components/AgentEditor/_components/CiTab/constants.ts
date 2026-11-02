import type { CiFailOn, CiTarget } from "@devdigest/shared";

/** "Fail CI on" segments; `labelKey` resolves under the `ci` namespace. */
export const FAIL_ON_SEGMENTS: readonly { value: Exclude<CiFailOn, "any">; labelKey: string }[] = [
  { value: "critical", labelKey: "tab.failOn.critical" },
  { value: "warning", labelKey: "tab.failOn.warning" },
  { value: "never", labelKey: "tab.failOn.never" },
];

/** Export targets; only GitHub Actions is wired. */
export const CI_TARGETS: readonly { value: CiTarget; labelKey: string; enabled: boolean }[] = [
  { value: "gha", labelKey: "wizard.target.gha", enabled: true },
  { value: "circle", labelKey: "wizard.target.circle", enabled: false },
  { value: "jenkins", labelKey: "wizard.target.jenkins", enabled: false },
  { value: "cli", labelKey: "wizard.target.cli", enabled: false },
];

export const CI_TRIGGERS: readonly { value: string; labelKey: string }[] = [
  { value: "opened", labelKey: "wizard.configure.triggers.opened" },
  { value: "synchronize", labelKey: "wizard.configure.triggers.synchronize" },
  { value: "reopened", labelKey: "wizard.configure.triggers.reopened" },
];

export type CiPostAs = "github_review" | "pr_comment" | "none";

export const CI_POST_AS: readonly { value: CiPostAs; labelKey: string }[] = [
  { value: "github_review", labelKey: "wizard.configure.postAs.githubReview" },
  { value: "pr_comment", labelKey: "wizard.configure.postAs.prComment" },
  { value: "none", labelKey: "wizard.configure.postAs.none" },
];

/** Wizard step label keys, in order. */
export const WIZARD_STEPS: readonly string[] = [
  "wizard.steps.target",
  "wizard.steps.preview",
  "wizard.steps.configure",
  "wizard.steps.install",
];

/** The bundled runner is shown by size only, never its contents. */
export const RUNNER_BUNDLE_PATH = ".devdigest/runner/index.js";
