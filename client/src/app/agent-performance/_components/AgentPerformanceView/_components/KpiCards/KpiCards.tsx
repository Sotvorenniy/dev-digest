"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import { formatCost, formatSignedCost } from "@/components/run-cost-badge";
import type { AgentPerf } from "@/lib/types";
import { formatPercent } from "@/lib/agent-metrics";
import { costDelta, seriesUnit } from "../../helpers";
import { s } from "../../styles";

const EXPLANATION_ID = "agent-performance-estimate-explanation";
const RING_SIZE = 44;
const RING_STROKE = 4;

/** App-local accept-rate ring: a fixed accent colour and no number inside (the % sits beside it). */
function AcceptRing({ rate, label }: { rate: number | null; label: string }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const filled = rate == null ? 0 : Math.max(0, Math.min(1, rate));
  return (
    <span role="img" aria-label={label} style={s.ringBox}>
      <svg width={RING_SIZE} height={RING_SIZE} style={s.ringSvg} aria-hidden="true">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke="var(--bg-hover)" strokeWidth={RING_STROKE} />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={RING_STROKE}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - filled)}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function KpiCards({ data }: { data: AgentPerf }) {
  const t = useTranslations("agentPerformance");
  const { summary } = data;
  const delta = costDelta(summary);
  const unit = t(seriesUnit(data.period) === "hour" ? "kpi.unitHour" : "kpi.unitDay");
  const acceptText = formatPercent(summary.avg_accept_rate);
  const mostActive = summary.most_active;
  const mostActiveName = mostActive?.agent_name ?? null;

  return (
    <section aria-label={t("kpi.label")} style={s.kpiGrid}>
      <div data-kpi="total-runs" style={s.kpiCard}>
        <span style={s.kpiLabel}>{t("kpi.totalRuns")}</span>
        <div style={s.kpiValueRow}>
          <span className="tnum" style={s.kpiValue}>
            {summary.runs}
          </span>
          <span role="img" aria-label={t("kpi.runsSeriesAlt", { count: summary.runs, unit })}>
            <Sparkline data={summary.runs_series.map((p) => p.value)} />
          </span>
        </div>
      </div>

      <div data-kpi="total-cost" style={s.kpiCard}>
        <span style={s.kpiLabel}>
          {t("kpi.totalCost")}
          <span style={s.estimateTag} aria-describedby={EXPLANATION_ID}>
            {t("estimate.label")}
          </span>
        </span>
        <span id={EXPLANATION_ID} style={s.srOnly}>
          {t("estimate.explanation")}
        </span>
        <span className="tnum" style={s.kpiValue}>
          {formatCost(summary.total_cost_usd)}
        </span>
        {delta != null && (
          <span data-cost-delta style={s.kpiSub}>
            {t("kpi.costDelta", { amount: formatSignedCost(delta) })}
            <span style={{ ...s.estimateTag, marginLeft: 6 }}>{t("estimate.label")}</span>
          </span>
        )}
      </div>

      <div data-kpi="avg-accept-rate" style={s.kpiCard}>
        <span style={s.kpiLabel}>{t("kpi.avgAcceptRate")}</span>
        <div style={s.ringWrap}>
          <AcceptRing rate={summary.avg_accept_rate} label={t("kpi.acceptRingAlt", { percent: acceptText })} />
          <div>
            <div className="tnum" style={s.kpiValue}>
              {acceptText}
            </div>
            <div style={s.kpiSub}>{t("decisions", { count: summary.decided })}</div>
          </div>
        </div>
      </div>

      <div data-kpi="most-active" style={s.kpiCard}>
        <span style={s.kpiLabel}>{t("kpi.mostActive")}</span>
        {mostActive && mostActiveName ? (
          <>
            <span style={s.mostActiveName} title={mostActiveName} aria-label={mostActiveName}>
              {mostActiveName}
            </span>
            <span style={s.kpiSub}>
              {t("kpi.mostActiveDetail", { runs: mostActive.runs, rate: formatPercent(mostActive.accept_rate) })}
            </span>
          </>
        ) : (
          <span style={s.kpiValue}>—</span>
        )}
      </div>
    </section>
  );
}
