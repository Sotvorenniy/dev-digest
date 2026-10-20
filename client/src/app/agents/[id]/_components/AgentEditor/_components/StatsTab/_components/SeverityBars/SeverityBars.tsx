"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentStats } from "@/lib/types";
import { SEVERITY_COLORS } from "../../constants";
import { severityLabels, severityTotal } from "../../helpers";
import { s } from "../../styles";

/** One stacked bar per time bucket, plain HTML/CSS: each bar carries a text alternative
 *  and the legend names the colours, so colour is never the only signal. */
export function SeverityBars({ stats }: { stats: AgentStats }) {
  const t = useTranslations("agentStats");
  const series = stats.findings_by_severity_series;
  const labels = severityLabels(series, stats.severity_bucket, (n) => t("severity.week", { n }));
  const max = Math.max(1, ...series.map((p) => p.CRITICAL + p.WARNING + p.SUGGESTION));

  return (
    <section data-severity-bars aria-label={t("severity.title")} style={s.panel}>
      <h4 style={s.panelTitle}>{t("severity.title")}</h4>
      <div style={s.bars}>
        {series.map((p, i) => {
          const label = labels[i] ?? "";
          const total = p.CRITICAL + p.WARNING + p.SUGGESTION;
          const barHeight = (total / max) * 100;
          const part = (n: number) => (total === 0 ? 0 : (n / total) * 100);
          return (
            <div key={p.label} style={s.barCol}>
              <div
                data-severity-bucket
                role="img"
                aria-label={t("severity.barAlt", { label, critical: p.CRITICAL, warning: p.WARNING, suggestion: p.SUGGESTION })}
                style={{ ...s.barStack, flex: "none", height: `${barHeight}%` }}
              >
                <span style={s.barSeg(part(p.SUGGESTION), SEVERITY_COLORS.SUGGESTION)} />
                <span style={s.barSeg(part(p.WARNING), SEVERITY_COLORS.WARNING)} />
                <span style={s.barSeg(part(p.CRITICAL), SEVERITY_COLORS.CRITICAL)} />
              </div>
              <span aria-hidden="true" style={s.barLabel}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div style={s.legendRow}>
        <span style={s.legendItem}>
          <span aria-hidden="true" style={{ ...s.swatch, background: SEVERITY_COLORS.CRITICAL }} />
          {t("severity.critical")}
        </span>
        <span style={s.legendItem}>
          <span aria-hidden="true" style={{ ...s.swatch, background: SEVERITY_COLORS.WARNING }} />
          {t("severity.warning")}
        </span>
        <span style={s.legendItem}>
          <span aria-hidden="true" style={{ ...s.swatch, background: SEVERITY_COLORS.SUGGESTION }} />
          {t("severity.suggestion")}
        </span>
      </div>
      <p style={s.panelFooter}>{t("severity.footer", { count: severityTotal(stats) })}</p>
    </section>
  );
}
