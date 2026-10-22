"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell/PageShell";
import { useEvalDashboard } from "@/lib/hooks";
import { AGENTS_HREF, SKELETON_ROWS } from "./constants";
import { s } from "./styles";
import { AgentEvalRow } from "./_components/AgentEvalRow";
import { RecentEvalRuns } from "./_components/RecentEvalRuns";

/** Workspace Eval Dashboard: agents with eval cases (latest scores + recall sparkline) and the newest runs. */
export function EvalDashboardView() {
  const t = useTranslations("eval");
  const query = useEvalDashboard();
  const data = query.data;

  let state: "loading" | "error" | "empty" | "ready";
  if (query.isPending) state = "loading";
  else if (query.isError) state = "error";
  else if (!data || data.agents.length === 0) state = "empty";
  else state = "ready";

  let body: React.ReactNode;
  if (state === "loading") {
    body = (
      <div style={s.skeletonRows} aria-busy="true">
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} height={64} />
        ))}
      </div>
    );
  } else if (state === "error") {
    body = (
      <div style={s.errorBox}>
        <ErrorState title={t("dashboard.errorTitle")} onRetry={() => query.refetch()} />
      </div>
    );
  } else if (state === "empty") {
    body = (
      <EmptyState
        icon="FlaskConical"
        title={t("dashboard.emptyTitle")}
        body={
          <>
            {t("dashboard.emptyBody")}{" "}
            <Link href={AGENTS_HREF} style={s.emptyLink}>
              {t("dashboard.emptyLink")}
            </Link>
          </>
        }
      />
    );
  } else if (data) {
    body = (
      <div style={s.stack}>
        <section style={s.section} aria-label={t("dashboard.agentsHeading")}>
          <h2 style={s.heading}>{t("dashboard.agentsHeading")}</h2>
          <div style={s.list}>
            {data.agents.map((a) => (
              <AgentEvalRow key={a.agent_id} agent={a} />
            ))}
          </div>
        </section>
        <section style={s.section}>
          <h2 style={s.heading}>{t("dashboard.recentRunsAll")}</h2>
          {data.recent_runs.length === 0 ? (
            <div style={s.muted}>{t("dashboard.noRuns")}</div>
          ) : (
            <RecentEvalRuns runs={data.recent_runs} />
          )}
        </section>
      </div>
    );
  }

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <div data-eval-dashboard data-state={state} style={s.root}>
        <PageContainer title={t("dashboard.defaultTitle")}>{body}</PageContainer>
      </div>
    </AppShell>
  );
}

export default EvalDashboardView;
