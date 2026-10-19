"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import { formatCost, formatSignedCost } from "@/components/run-cost-badge";
import { formatDuration, formatPercent } from "@/lib/agent-metrics";
import type { AgentStats } from "@/lib/types";
import { acceptDeltaPoints, costDelta, durationDelta, runsDelta, runsUnit, signed } from "../../helpers";
import { s } from "../../styles";

const EXPLANATION_ID_SUFFIX = "estimate-explanation";

/** A delta line with a text sign (never colour-only), or the no-history message. */
function Delta({ text, noHistory, dataKey }: { text: string | null; noHistory: string; dataKey: string }) {
  return (
    <span data-kpi-delta={dataKey} style={s.kpiDelta}>
      {text ?? noHistory}
    </span>
  );
}

export function StatsKpiCards({ stats }: { stats: AgentStats }) {
  const t = useTranslations("agentStats");
  const tp = useTranslations("agentPerformance");
  const explanationId = `${React.useId()}-${EXPLANATION_ID_SUFFIX}`;
  const unit = t(runsUnit(stats.period) === "hour" ? "kpi.unitHour" : "kpi.unitDay");
  const noHistory = t("kpi.noHistory");

  const runs = runsDelta(stats);
  const cost = costDelta(stats);
  const duration = durationDelta(stats);
  const accept = acceptDeltaPoints(stats);

  const durationText =
    duration == null ? null : duration === 0 ? formatDuration(0) : `${duration < 0 ? "−" : "+"}${formatDuration(Math.abs(duration))}`;

  return (
    <section aria-label={t("kpi.label")} style={s.kpiGrid}>
      <div data-kpi="runs" style={s.kpiCard}>
        <span style={s.kpiLabel}>{t("kpi.totalRuns")}</span>
        <div style={s.kpiValueRow}>
          <span className="tnum" style={s.kpiValue}>
            {stats.runs}
          </span>
          <span role="img" aria-label={t("kpi.runsSeriesAlt", { count: stats.runs, unit })}>
            <Sparkline data={stats.runs_series.map((p) => p.value)} />
          </span>
        </div>
        <Delta dataKey="runs" noHistory={noHistory} text={runs == null ? null : t("kpi.delta", { delta: signed(runs) })} />
      </div>

      <div data-kpi="avg-cost" style={s.kpiCard}>
        <span style={s.kpiLabel}>
          {t("kpi.avgCost")}
          <span style={s.estimateTag} aria-describedby={explanationId}>
            {tp("estimate.label")}
          </span>
        </span>
        <span id={explanationId} style={s.srOnly}>
          {tp("estimate.explanation")}
        </span>
        <span className="tnum" style={s.kpiValue}>
          {formatCost(stats.avg_cost_usd)}
        </span>
        <Delta dataKey="avg-cost" noHistory={noHistory} text={cost == null ? null : t("kpi.delta", { delta: formatSignedCost(cost) })} />
      </div>

      <div data-kpi="avg-duration" style={s.kpiCard}>
        <span style={s.kpiLabel}>{t("kpi.avgDuration")}</span>
        <span className="tnum" style={s.kpiValue}>
          {formatDuration(stats.avg_latency_ms)}
        </span>
        <Delta dataKey="avg-duration" noHistory={noHistory} text={durationText == null ? null : t("kpi.delta", { delta: durationText })} />
      </div>

      <div data-kpi="accept-rate" style={s.kpiCard}>
        <span style={s.kpiLabel}>{t("kpi.acceptRate")}</span>
        <span className="tnum" style={s.kpiValue}>
          {formatPercent(stats.accept_rate)}
        </span>
        <span style={s.kpiSub}>{t("kpi.decidedBasis", { count: stats.decided })}</span>
        <Delta dataKey="accept-rate" noHistory={noHistory} text={accept == null ? null : t("kpi.deltaPoints", { delta: signed(accept) })} />
      </div>
    </section>
  );
}
