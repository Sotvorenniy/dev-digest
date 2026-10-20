"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatPercent } from "@/lib/agent-metrics";
import { formatShortDate } from "../../helpers";
import { s } from "../../styles";

export interface UsageRowView {
  key: string;
  label: string;
  title: string;
  share: number | null;
}

interface UsageCoverage {
  runs_with_data: number;
  runs_without_data: number;
  data_from: string | null;
}

/** Skills / memory usage list: rows with a share bar, a coverage footer and an empty text.
 *  Names and labels come from stored data, so they are rendered as plain text only. */
export function UsagePanel({
  kind,
  usage,
  items,
  moreCount = 0,
}: {
  kind: "skills" | "memory";
  usage: UsageCoverage;
  items: UsageRowView[];
  moreCount?: number;
}) {
  const t = useTranslations("agentStats");
  const rowAttr = kind === "skills" ? { "data-skill-row": "" } : { "data-memory-row": "" };
  const withData = usage.runs_with_data;
  const total = withData + usage.runs_without_data;

  return (
    <section data-usage-panel={kind} aria-label={t(`${kind}.title`)} style={s.panel}>
      <div>
        <h4 style={s.panelTitle}>{t(`${kind}.title`)}</h4>
        <p style={s.panelNote}>{t(`${kind}.description`)}</p>
      </div>
      {items.length === 0 ? (
        <p style={s.panelEmpty}>{t(`${kind}.empty`)}</p>
      ) : (
        <ul style={s.list}>
          {items.map((it) => {
            const percent = formatPercent(it.share);
            return (
              <li key={it.key} {...rowAttr} style={s.usageRow}>
                <span style={s.usageName} title={it.title}>
                  {it.label}
                </span>
                <span aria-hidden="true" style={s.barTrack}>
                  <span style={s.barFill(it.share ?? 0)} />
                </span>
                <span className="tnum" style={s.usageShare}>
                  <span style={s.srOnly}>{t(`${kind}.rowAlt`, { name: it.title, percent })}</span>
                  <span aria-hidden="true">{percent}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {moreCount > 0 && <p style={s.panelNote}>{t("memory.more", { count: moreCount })}</p>}
      <p data-coverage style={s.panelFooter}>
        {t("coverage.basedOn", { n: withData, m: total })}
        {usage.runs_without_data > 0 && usage.data_from ? ` · ${t("coverage.noDataBefore", { date: formatShortDate(usage.data_from) })}` : ""}
      </p>
    </section>
  );
}
