import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@/lib/types";

/** Per-severity visual meta. Colours are CSS variables, as in VerdictBanner. */
export const SEVERITY_META: Record<RiskSeverity, { c: string; bg: string; icon: IconName }> = {
  high: { c: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertOctagon" },
  medium: { c: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle" },
  low: { c: "var(--info)", bg: "var(--info-bg)", icon: "Info" },
};

export const SETTINGS_HREF = "/settings";
