"use client";

import React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell/PageShell";
import RunTraceDrawer from "@/components/run-trace-drawer";
import { formatCost } from "@/components/run-cost-badge/helpers";
import { formatDuration } from "@/lib/agent-metrics";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { useFindingAction } from "@/lib/hooks/reviews";
import type { AgentColumn } from "@/lib/types";
import { headerTotals, parseAgentsParam } from "./helpers";
import { s } from "./styles";
import { AgentColumnCard } from "./_components/AgentColumnCard";
import { ConflictsSection } from "./_components/ConflictsSection";
import { TabsView } from "./_components/TabsView";
import { ViewToggle, type ResultsView } from "./_components/ViewToggle";

/** /multi-agent/:prId?agents=a,b — one column per agent, live while runs are going, plus conflicts. */
export function MultiAgentResultsView() {
  const t = useTranslations("runs");
  const { prId } = useParams<{ prId: string }>();
  const search = useSearchParams();
  const agentIds = parseAgentsParam(search.get("agents"));
  const query = useMultiAgentRun(prId, agentIds);
  const findingAction = useFindingAction();
  const [view, setView] = React.useState<ResultsView>("columns");
  const [drawerAgentId, setDrawerAgentId] = React.useState<string | null>(null);

  const data = query.data;
  const drawerColumn = data?.columns.find((c) => c.agent_id === drawerAgentId) ?? null;

  let body: React.ReactNode;
  if (query.isError) {
    body = <ErrorState title={t("page.title")} onRetry={() => query.refetch()} />;
  } else if (!data) {
    body = <Skeleton height={160} />;
  } else {
    body = (
      <>
        <ViewToggle value={view} onChange={setView} />
        {view === "columns" ? (
          <div style={s.columns} data-columns-view>
            {data.columns.map((c) => (
              <AgentColumnCard key={c.agent_id} column={c} onViewTrace={() => setDrawerAgentId(c.agent_id)} />
            ))}
          </div>
        ) : (
          <TabsView
            columns={data.columns}
            pending={findingAction.isPending}
            onAction={(findingId, action) => findingAction.mutate({ findingId, action, prId })}
            onViewTrace={(c: AgentColumn) => setDrawerAgentId(c.agent_id)}
          />
        )}
        <ConflictsSection columns={data.columns} conflicts={data.conflicts} />
      </>
    );
  }

  const totals = data ? headerTotals(data.columns) : null;

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <PageContainer
        title={t("page.title")}
        subtitle={
          data && totals ? (
            <span style={s.meta} data-multi-agent-meta>
              {t("page.meta", {
                count: data.columns.length,
                duration: formatDuration(totals.durationMs),
                cost: formatCost(totals.costUsd),
              })}
            </span>
          ) : undefined
        }
      >
        <div style={s.root}>{body}</div>
      </PageContainer>
      {drawerColumn?.run_id && (
        <RunTraceDrawer
          runId={drawerColumn.run_id}
          agentName={drawerColumn.agent_name}
          prNumber={data?.pr_number}
          findings={drawerColumn.findings}
          running={drawerColumn.status === "running"}
          onClose={() => setDrawerAgentId(null)}
        />
      )}
    </AppShell>
  );
}

export default MultiAgentResultsView;
