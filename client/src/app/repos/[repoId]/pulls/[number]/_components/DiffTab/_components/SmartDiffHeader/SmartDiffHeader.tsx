/* SmartDiffHeader — title, "N files · +A −D", and the Smart/Original order toggle. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Button } from "@devdigest/ui";
import { s } from "./styles";

export type DiffOrder = "smart" | "original";

export function SmartDiffHeader({
  filesCount,
  additions,
  deletions,
  filesWithFindings,
  order,
  onOrderChange,
  commentCount,
  showComments,
  onToggleComments,
}: {
  filesCount: number;
  additions: number;
  deletions: number;
  filesWithFindings: number;
  order: DiffOrder;
  onOrderChange: (order: DiffOrder) => void;
  commentCount: number;
  showComments: boolean;
  onToggleComments: () => void;
}) {
  const t = useTranslations("prReview");
  const options: { value: DiffOrder; label: string }[] = [
    { value: "smart", label: t("smartDiff.smartOrder") },
    { value: "original", label: t("smartDiff.originalOrder") },
  ];
  return (
    <div style={s.wrap}>
      <div style={s.title}>
        <Icon.Code size={13} />
        {t("smartDiff.title")}
      </div>
      <div style={s.row}>
        <div style={s.summary}>
          <span>{t("smartDiff.summary", { count: filesCount })}</span>
          <span className="mono tnum">
            <span style={s.add}>+{additions}</span> <span style={s.del}>−{deletions}</span>
          </span>
          {filesWithFindings > 0 && <span>· {t("smartDiff.filesWithFindings", { count: filesWithFindings })}</span>}
        </div>
        <div style={s.right}>
          {commentCount > 0 && (
            <Button kind="ghost" size="sm" icon={showComments ? "EyeOff" : "Eye"} onClick={onToggleComments}>
              {showComments ? t("smartDiff.hideComments") : t("smartDiff.showComments")} ({commentCount})
            </Button>
          )}
          <div style={s.toggle} role="group" aria-label={t("smartDiff.toggleLabel")}>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                data-diff-order={o.value}
                aria-pressed={order === o.value}
                onClick={() => onOrderChange(o.value)}
                style={s.toggleBtn(order === o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
