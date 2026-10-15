"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@/lib/types";
import { SEVERITY_META } from "../../constants";
import { s } from "../../styles";

export function RiskRow({ risk }: { risk: Risk }) {
  const t = useTranslations("brief");
  const [expanded, setExpanded] = React.useState(false);
  const meta = SEVERITY_META[risk.severity];
  const SevIcon = Icon[meta.icon];
  return (
    <li style={s.riskRow} data-risk-row>
      <span
        role="img"
        aria-label={t(`severity.${risk.severity}`)}
        data-risk-severity={risk.severity}
        style={{ ...s.riskIcon, color: meta.c }}
      >
        <SevIcon size={16} />
      </span>
      <div style={s.riskBody}>
        <span style={s.riskTitle}>
          {risk.explanation && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={t("risk.expand", { title: risk.title })}
              onClick={() => setExpanded((v) => !v)}
              style={s.riskToggle}
              data-risk-toggle
            >
              <Icon.ChevronRight size={13} style={{ transform: expanded ? "rotate(90deg)" : "none" }} />
            </button>
          )}
          {risk.title}
        </span>
        {expanded && risk.explanation && <span style={s.riskExplanation}>{risk.explanation}</span>}
        {risk.file_refs.length > 0 && (
          <span className="mono" style={s.riskRefs}>
            {risk.file_refs.join(", ")}
          </span>
        )}
      </div>
    </li>
  );
}
