"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@/lib/types";
import { SEVERITY_META } from "../../constants";
import { parseFileRef, reviewFocusHref } from "../../helpers";
import { s } from "../../styles";

interface RiskRowProps {
  risk: Risk;
  repoId: string;
  prNumber: number;
}

export function RiskRow({ risk, repoId, prNumber }: RiskRowProps) {
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
            {risk.file_refs.map((ref, i) => {
              const { file, line } = parseFileRef(ref);
              return (
                <React.Fragment key={`${ref}:${i}`}>
                  {i > 0 && ", "}
                  <Link
                    href={reviewFocusHref(repoId, prNumber, file, line)}
                    style={s.focusLink}
                    aria-label={t("openFile", { file: ref })}
                    data-risk-ref
                  >
                    {ref}
                  </Link>
                </React.Fragment>
              );
            })}
          </span>
        )}
      </div>
    </li>
  );
}
