import type { CiFailOn } from "@devdigest/shared";
import { ApiError } from "@/lib/api";

/** Segment selected for an agent's `ci_fail_on`; `any` matches none. */
export function selectedFailOnSegment(ciFailOn: CiFailOn): "critical" | "warning" | "never" | null {
  return ciFailOn === "any" ? null : ciFailOn;
}

/** Only https://github.com/ links are rendered as anchors. */
export function isGithubPrUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("https://github.com/");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** i18n key (under `ci`) for an export error shown inline on the install step. */
export function exportErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429 || err.code === "rate_limited") return "wizard.install.error.rateLimited";
    if (err.status === 422 || err.code === "config_error") return "wizard.install.error.config";
    if (err.status === 502) return "wizard.install.error.external";
  }
  return "wizard.install.error.generic";
}
