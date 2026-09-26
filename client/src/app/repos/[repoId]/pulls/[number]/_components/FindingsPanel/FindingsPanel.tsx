/* FindingsPanel — severity counters + severity filter + hide-low-confidence +
   j/k navigation + FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, SeverityBadge, Chip, SEV, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "@/lib/hooks";
import { countBySeverity } from "@/components/severity-chips";
import { KEY_TO_ACTION, SEVERITY_FILTERS } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [sevFilter, setSevFilter] = React.useState<string | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, sevFilter),
    [findings, hideLow, sevFilter],
  );

  // The two rows count deliberately different lists. Pills describe what is on
  // screen, so their numbers always match the cards below — filter to Critical
  // and the Warning pill leaves with its cards. The filter buttons describe
  // what is available, so they keep the run's totals; sourcing them from
  // `shown` would zero out every inactive button and make the row look dead.
  const shownCounts = React.useMemo(() => countBySeverity(shown), [shown]);
  const runCounts = React.useMemo(
    () => countBySeverity(visibleFindings(findings, hideLow)),
    [findings, hideLow],
  );

  // A filter change reshuffles the list under the cursor; park it at the top so
  // j/k and the a/d shortcuts stay pointed at a card that is actually visible.
  React.useEffect(() => setFocusIdx(0), [sevFilter]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  const pills = SEVERITY_FILTERS.filter((sev) => (shownCounts[sev] ?? 0) > 0);

  return (
    <div>
      {pills.length > 0 && (
        <div style={s.pillRow}>
          {pills.map((sev, i) => (
            <React.Fragment key={sev}>
              {i > 0 && <span style={s.pillSep}>·</span>}
              {/* Same semantic-hook style as FindingCard's data-finding-id. */}
              <span data-severity-pill={sev}>
                <SeverityBadge severity={sev as Severity} count={shownCounts[sev]} />
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={s.toolbar}>
        {/* A run that found nothing has nothing to filter — three dead buttons
            over an empty state is noise, so the row sits out that case. */}
        <div style={s.filterRow}>
          {findings.length > 0 &&
            SEVERITY_FILTERS.map((sev) => (
              <Chip
                key={sev}
                icon={SEV[sev as Severity].icon}
                color={SEV[sev as Severity].c}
                count={runCounts[sev] ?? 0}
                active={sevFilter === sev}
                // Clicking the active severity again clears the filter.
                onClick={() => setSevFilter((prev) => (prev === sev ? null : sev))}
              >
                {SEV[sev as Severity].label}
              </Chip>
            ))}
        </div>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
