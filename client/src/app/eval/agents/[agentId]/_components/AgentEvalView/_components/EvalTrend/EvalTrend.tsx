"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { LineChart } from "@devdigest/ui";
import type { EvalMetricPoint } from "@/lib/types";
import { formatPct } from "@/lib/eval-metrics";
import { trendSeries, type TrendSeriesKey } from "../../helpers";
import { s } from "../../styles";

const SERIES: { key: TrendSeriesKey; color: string; value: (p: EvalMetricPoint) => number | null }[] = [
  { key: "recall", color: "var(--accent)", value: (p) => p.recall },
  { key: "precision", color: "var(--ok)", value: (p) => p.precision },
  { key: "citation", color: "var(--warn)", value: (p) => p.citation_accuracy },
];

/** Metric trend: a three-series chart plus a visually hidden table with the same values as its text alternative. */
export function EvalTrend({ trend }: { trend: EvalMetricPoint[] }) {
  const t = useTranslations("eval");
  const locale = useLocale();
  const plotted = trendSeries(trend);

  return (
    <section data-eval-trend style={s.trend} aria-label={t("dashboard.metricTrend")}>
      <h3 style={s.trendHeading}>{t("dashboard.metricTrend")}</h3>
      <div style={s.legend}>
        {SERIES.map((x) => (
          <span key={x.key} style={s.legendItem}>
            <span aria-hidden="true" style={{ ...s.swatch, background: x.color }} />
            {t(`dashboard.legend.${x.key}`)}
          </span>
        ))}
      </div>
      {trend.length === 0 ? (
        <div style={s.muted}>{t("dashboard.noFinishedRun")}</div>
      ) : (
        <div aria-hidden="true">
          <LineChart
            series={SERIES.map((x) => ({ name: t(`dashboard.legend.${x.key}`), color: x.color, data: plotted[x.key] }))}
            h={180}
            yMin={0}
            yMax={1}
          />
        </div>
      )}
      <table data-eval-trend-table style={s.srOnly}>
        <caption>{t("dashboard.trendTableCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.table.ranAt")}</th>
            {SERIES.map((x) => (
              <th key={x.key} scope="col">
                {t(`dashboard.legend.${x.key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trend.map((p) => (
            <tr key={p.run_id}>
              <th scope="row">{new Date(p.finished_at).toLocaleString(locale)}</th>
              {SERIES.map((x) => (
                <td key={x.key}>{formatPct(x.value(p))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default EvalTrend;
