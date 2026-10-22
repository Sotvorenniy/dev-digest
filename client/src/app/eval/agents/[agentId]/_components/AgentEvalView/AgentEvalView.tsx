"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell/PageShell";
import { EvalMetricCards } from "@/components/eval-metric-cards";
import { EvalRunHistory } from "@/components/eval-run-history";
import { useAgentEvalDashboard, useStartEvalRun } from "@/lib/hooks";
import { isNewestRunning } from "@/lib/eval-metrics";
import { API_KEYS_HREF, startErrorKey } from "@/lib/eval-errors";
import { isNotFound } from "./helpers";
import { s } from "./styles";
import { EvalTrend } from "./_components/EvalTrend";

/** Per-agent eval dashboard: metric cards, trend, run history with Compare, and Run eval. */
export function AgentEvalView() {
  const t = useTranslations("eval");
  const { agentId } = useParams<{ agentId: string }>();
  const query = useAgentEvalDashboard(agentId);
  const start = useStartEvalRun(agentId);
  const data = query.data;

  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard"), href: "/eval" }];

  const notFound = query.isError && isNotFound(query.error);
  const running = isNewestRunning(data?.runs);
  const errorKey = start.isError ? startErrorKey(start.error) : null;

  let state: "loading" | "notFound" | "error" | "ready";
  if (query.isPending) state = "loading";
  else if (notFound) state = "notFound";
  else if (query.isError || !data) state = "error";
  else state = "ready";

  let body: React.ReactNode;
  if (state === "loading") {
    body = (
      <div style={s.skeletonRows} aria-busy="true">
        <Skeleton height={96} />
        <Skeleton height={220} />
        <Skeleton height={160} />
      </div>
    );
  } else if (state === "notFound") {
    body = (
      <EmptyState
        icon="FlaskConical"
        title={t("dashboard.notFoundTitle")}
        body={
          <>
            {t("dashboard.notFoundBody")}{" "}
            <Link href="/eval" style={s.link}>
              {t("dashboard.allAgents")}
            </Link>
          </>
        }
      />
    );
  } else if (state === "error") {
    body = (
      <div style={s.errorBox}>
        <ErrorState title={t("dashboard.errorTitle")} onRetry={() => query.refetch()} />
      </div>
    );
  } else if (data) {
    body = (
      <div style={s.stack}>
        <EvalMetricCards latest={data.latest} previous={data.previous} metrics={["recall", "precision", "citation"]} />
        <EvalTrend trend={data.trend} />
        <EvalRunHistory runs={data.runs} agentName={data.name} />
      </div>
    );
  }

  const title = data ? (
    <span style={s.titleRow}>
      <span style={s.titleName} title={data.name}>
        {data.name}
      </span>
      <span style={s.model} title={data.model}>
        {data.model}
      </span>
    </span>
  ) : (
    t("dashboard.defaultTitle")
  );

  const actions = data ? (
    <Button
      kind="primary"
      icon="Play"
      disabled={running || start.isPending}
      loading={running || start.isPending}
      onClick={() => start.mutate()}
    >
      {running ? t("dashboard.running") : t("dashboard.runEvalButton")}
    </Button>
  ) : undefined;

  return (
    <AppShell crumb={crumb}>
      <div data-eval-agent-dashboard data-state={state} style={s.root}>
        <PageContainer title={title} actions={actions}>
          <Link href="/eval" style={s.back}>
            {t("dashboard.allAgents")}
          </Link>
          {errorKey && (
            <div role="alert" style={s.error}>
              {t(`evalsTab.errors.${errorKey}`)}{" "}
              {errorKey === "provider_not_configured" && (
                <Link href={API_KEYS_HREF} style={s.link}>
                  {t("evalsTab.settingsLink")}
                </Link>
              )}
            </div>
          )}
          {body}
        </PageContainer>
      </div>
    </AppShell>
  );
}

export default AgentEvalView;
