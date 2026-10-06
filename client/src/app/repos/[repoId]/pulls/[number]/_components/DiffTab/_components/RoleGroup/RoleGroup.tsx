/* RoleGroup — one collapsible smart-diff group (role header + its file cards). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { COLLAPSED_BY_DEFAULT, ROLE_META } from "../../constants";
import { s } from "./styles";

export function RoleGroup({
  role,
  files,
  filesWithFindings,
  commenting,
  findings,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  /** Number of files in this group that carry at least one finding. */
  filesWithFindings: number;
  commenting: DiffCommentApi;
  findings: DiffFindingApi;
}) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[role];
  // Default: groups skimmed last start closed, unless they hold findings. A manual toggle wins.
  const [manualOpen, setManualOpen] = React.useState<boolean | null>(null);
  const open = manualOpen ?? (filesWithFindings > 0 || !COLLAPSED_BY_DEFAULT.has(role));

  return (
    <div data-role-group={role} style={s.wrap}>
      <button type="button" aria-expanded={open} onClick={() => setManualOpen(!open)} style={s.header}>
        <Icon.ChevronRight size={14} style={s.chevron(open)} />
        <span style={s.swatch(meta.color)} />
        <span style={s.label}>{t(`smartDiff.${meta.label}`)}</span>
        <span style={s.description}>{t(`smartDiff.${meta.description}`)}</span>
        {filesWithFindings > 0 && (
          <span style={s.findings}>
            <span style={s.dot} />
            <span data-group-findings-count>{filesWithFindings}</span>
          </span>
        )}
        <span style={s.count}>{t("smartDiff.summary", { count: files.length })}</span>
      </button>
      {open && <DiffViewer files={files} commenting={commenting} findings={findings} />}
    </div>
  );
}
