"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell/PageShell";
import { PeriodPicker, parsePeriodQuery, periodToSearch, presetPeriod, type UiPeriod } from "@/components/period-picker";
import { useAgentPerformance } from "@/lib/hooks/agent-performance";
import { metricsView } from "@/lib/agent-metrics";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";
import { CostBreakdown } from "./_components/CostBreakdown";
import { KpiCards } from "./_components/KpiCards";
import { PerfTable } from "./_components/PerfTable";

/** Global Agent Performance dashboard. The period lives in the URL (`from`/`to`/`range`);
 *  without a valid one it falls back to a stable 30-day window computed once on open. */
export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  const router = useRouter();
  const search = useSearchParams();
  const [fallback] = React.useState(() => presetPeriod("30d", Date.now()));
  const period: UiPeriod = parsePeriodQuery(new URLSearchParams(search.toString())) ?? fallback;
  const query = useAgentPerformance(period);

  const selectPeriod = (p: UiPeriod) => {
    router.replace(`/agent-performance?${periodToSearch(p)}`);
  };

  const view = metricsView(query, (d) => d.summary.runs === 0);

  let body: React.ReactNode;
  if (view.state === "loading") {
    body = (
      <div style={s.stack} aria-busy="true">
        <div style={s.skeletonGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
        <div style={s.skeletonRows}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={40} />
          ))}
        </div>
        <div style={s.skeletonDonuts}>
          <Skeleton height={160} />
          <Skeleton height={160} />
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
    body = view.data.summary.has_any_runs ? (
      <EmptyState icon="Gauge" title={t("empty.noRunsInPeriodTitle")} body={t("empty.noRunsInPeriodBody")} />
    ) : (
      <EmptyState icon="Gauge" title={t("empty.noRunsTitle")} body={t("empty.noRunsBody")} />
    );
  } else {
    body = (
      <div style={s.stack}>
        <KpiCards data={view.data} />
        <PerfTable rows={view.data.agents} />
        <CostBreakdown data={view.data} />
      </div>
    );
  }

  return (
    <AppShell crumb={[{ label: t("crumb") }]}>
      <div data-agent-performance data-state={view.state} style={s.root}>
        <PageContainer
          title={t("title")}
          subtitle={t("subtitle")}
          actions={<PeriodPicker period={period} onSelect={selectPeriod} />}
        >
          {body}
        </PageContainer>
      </div>
    </AppShell>
  );
}

export default AgentPerformanceView;
