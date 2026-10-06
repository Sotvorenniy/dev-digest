/* InlineFinding — a current review finding rendered under its flagged diff line.
   A trimmed copy of the Findings tab's FindingCard (shared code cannot import a
   route's `_components`): always expanded, no close button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum, Button, Markdown, type Severity, type Category } from "@devdigest/ui";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { fs } from "../styles";

export function InlineFinding({
  finding: f,
  pending,
  onAction,
}: {
  finding: FindingRecord;
  pending?: boolean;
  onAction: (action: FindingActionKind) => void;
}) {
  const t = useTranslations("prReview");
  const ts = useTranslations("shell");
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div data-finding-id={f.id} style={fs.card(f.severity, muted)}>
      <div style={fs.head}>
        <button
          type="button"
          data-finding-collapse
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? "finding.expand" : "finding.collapse")}
          title={t(collapsed ? "finding.expand" : "finding.collapse")}
          onClick={() => setCollapsed((c) => !c)}
          style={fs.collapseBtn}
        >
          <Icon.ChevronRight size={14} style={fs.chevron(!collapsed)} />
        </button>
        <SeverityBadge severity={f.severity as Severity} compact />
        <span style={fs.title(muted, dismissed)}>{f.title}</span>
        <CategoryTag category={f.category as Category} />
        {accepted && <span style={fs.tag}>{t("finding.accepted")}</span>}
        {dismissed && <span style={fs.tag}>{t("finding.dismissed")}</span>}
      </div>
      {!collapsed && (
        <>
      <div style={fs.meta}>
        <span className="mono">{ts("diffViewer.findingLine", { line: f.start_line })}</span>
        <ConfidenceNum value={f.confidence} />
      </div>
      <div style={fs.prose}>
        <Markdown>{f.rationale}</Markdown>
      </div>
      {f.suggestion && (
        <div style={fs.fixWrap}>
          <div style={fs.fixLabel}>{t("finding.suggestedFix")}</div>
          <div style={fs.prose}>
            <Markdown>{f.suggestion}</Markdown>
          </div>
        </div>
      )}
      <div style={fs.actions}>
        <Button kind="secondary" size="sm" icon="Check" disabled={pending} active={accepted} onClick={() => onAction("accept")}>
          {t("finding.accept")}
        </Button>
        <Button kind="ghost" size="sm" icon="X" disabled={pending} active={dismissed} onClick={() => onAction("dismiss")}>
          {t("finding.dismiss")}
        </Button>
      </div>
        </>
      )}
    </div>
  );
}
