"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { PeriodPicker, parsePeriodQuery, presetPeriod, type UiPeriod } from "@/components/period-picker";
import { useAgentStats } from "@/lib/hooks/agent-stats";
import { metricsView } from "@/lib/agent-metrics";
import { SKELETON_KPI_COUNT, SKELETON_PANEL_COUNT } from "./constants";
import { periodLabelParts } from "./helpers";
import { s } from "./styles";
import { StatsKpiCards } from "./_components/StatsKpiCards";
import { UsagePanel } from "./_components/UsagePanel";
import { SeverityBars } from "./_components/SeverityBars";
import { CategoryDonut } from "./_components/CategoryDonut";

/** Stats tab — one agent's KPIs, skill/memory usage and findings breakdown for a period.
 *  The period lives in the URL (`from`/`to`/`range`, next to `tab=stats`); without a valid
 *  one it falls back to a stable 30-day window computed once on open. Read-only. */
export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agentStats");
  const router = useRouter();
  const search = useSearchParams();
  const [fallback] = React.useState(() => presetPeriod("30d", Date.now()));
  const period: UiPeriod = parsePeriodQuery(new URLSearchParams(search.toString())) ?? fallback;
  const query = useAgentStats(agent.id, period);

  const selectPeriod = (p: UiPeriod) => {
    const next = new URLSearchParams(search.toString());
    next.set("tab", "stats");
    next.set("from", p.from);
    next.set("to", p.to);
    next.set("range", p.range);
    router.replace(`/agents/${agent.id}?${next.toString()}`);
  };

  const view = metricsView(query, (d) => d.runs === 0);

  const parts = periodLabelParts(period);
  const label =
    parts.kind === "preset"
      ? t("periodLabel.preset", { preset: t(parts.range === "1d" ? "periodLabel.oneDay" : "periodLabel.thirtyDays"), from: parts.from })
      : t("periodLabel.custom", { start: parts.start, end: parts.end });

  let body: React.ReactNode;
  if (view.state === "loading") {
    body = (
      <div style={s.stack} aria-busy="true">
        <div style={s.kpiGrid}>
          {Array.from({ length: SKELETON_KPI_COUNT }).map((_, i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
        <div style={s.panelGrid}>
          {Array.from({ length: SKELETON_PANEL_COUNT }).map((_, i) => (
            <Skeleton key={i} height={160} />
          ))}
        </div>
      </div>
    );
  } else if (view.state === "error") {
    body = (
      <div style={s.errorBox}>
        <ErrorState title={t("loadError")} onRetry={() => query.refetch()} />
      </div>
    );
  } else if (view.state === "empty") {
    body = view.data.has_any_runs ? (
      <EmptyState icon="BarChart" title={t("empty.noRunsInPeriodTitle")} body={t("empty.noRunsInPeriodBody")} />
    ) : (
      <EmptyState icon="BarChart" title={t("empty.notRunTitle")} body={t("empty.notRunBody")} />
    );
  } else {
    const data = view.data;
    body = (
      <div style={s.stack}>
        <StatsKpiCards stats={data} />
        <div style={s.panelGrid}>
          <UsagePanel
            kind="skills"
            usage={data.skills_usage}
            items={data.skills_usage.items.map((it) => ({ key: it.name, label: it.name, title: it.name, share: it.share }))}
          />
          <UsagePanel
            kind="memory"
            usage={data.memory_usage}
            items={data.memory_usage.items.map((it, i) => ({ key: `${i}-${it.label}`, label: it.truncated ? `${it.label}…` : it.label, title: it.label, share: it.share }))}
            moreCount={Math.max(0, data.memory_usage.entries_total - data.memory_usage.items.length)}
          />
          <SeverityBars stats={data} />
          <CategoryDonut stats={data} />
        </div>
      </div>
    );
  }

  return (
    <div data-agent-stats data-state={view.state} style={s.root}>
      <div style={s.header}>
        <p style={s.periodLabel}>{label}</p>
        <PeriodPicker period={period} onSelect={selectPeriod} />
      </div>
      {body}
    </div>
  );
}

export default StatsTab;
