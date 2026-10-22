"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent, EvalCase } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EvalMetricCards } from "@/components/eval-metric-cards";
import { EvalRunHistory } from "@/components/eval-run-history";
import { useDeleteEvalCase, useEvalCases, useEvalRuns, useStartEvalRun } from "@/lib/hooks";
import { latestFinished, previousFinished } from "@/lib/eval-metrics";
import { API_KEYS_HREF, METRIC_KEYS } from "./constants";
import { erroredCases, isRunning, passingCount, startErrorKey } from "./helpers";
import { s } from "./styles";
import { EvalCaseRow } from "./_components/EvalCaseRow";

/** Evals tab — this agent's eval cases, Run all, metric cards and run history. */
export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const cases = useEvalCases(agent.id);
  const runs = useEvalRuns(agent.id);
  const start = useStartEvalRun(agent.id);
  const remove = useDeleteEvalCase(agent.id);
  const [toDelete, setToDelete] = React.useState<EvalCase | null>(null);

  const caseList = cases.data ?? [];
  const runList = runs.data ?? [];
  const running = isRunning(runs.data);
  const latest = latestFinished(runs.data);
  const errored = erroredCases(runList[0]);
  const errorKey = start.isError ? startErrorKey(start.error) : null;
  const runDisabled = running || start.isPending || caseList.length === 0;

  let list: React.ReactNode;
  if (cases.isLoading) {
    list = <Skeleton height={120} />;
  } else if (cases.isError) {
    list = <ErrorState title={t("evalsTab.loadError")} onRetry={() => cases.refetch()} />;
  } else if (caseList.length === 0) {
    list = <EmptyState icon="FlaskConical" title={t("evalsTab.casesHeading")} body={t("evalsTab.emptyCasesHint")} />;
  } else {
    list = (
      <ul style={s.list}>
        {caseList.map((c) => (
          <EvalCaseRow key={c.id} evalCase={c} onDelete={() => setToDelete(c)} />
        ))}
      </ul>
    );
  }

  return (
    <div data-agent-evals style={s.root}>
      <EvalMetricCards latest={latest} previous={previousFinished(runs.data)} metrics={[...METRIC_KEYS]} />

      <div style={s.toolbar}>
        <div>
          <h3 style={s.heading}>{t("evalsTab.casesHeading")}</h3>
          <span style={s.summary}>
            {t("evalsTab.casesPassing", { passed: passingCount(caseList), total: caseList.length })}
          </span>
        </div>
        <div style={s.runRow}>
          <Button
            data-run-all
            kind="primary"
            icon="Play"
            disabled={runDisabled}
            aria-busy={running || start.isPending}
            onClick={() => start.mutate()}
          >
            {t("evalsTab.runAll")}
          </Button>
          <span aria-live="polite" style={s.live}>
            {running && t("evalsTab.runningState")}
            {!running && runList[0] && runList[0].status !== "running" && t("evalsTab.runFinished", { status: t(`runStatus.${runList[0].status}`) })}
            {errored > 0 && ` · ${t("evalsTab.casesErrored", { errored, total: runList[0]!.cases_total })}`}
          </span>
        </div>
      </div>

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

      {list}

      <EvalRunHistory runs={runList} agentName={agent.name} />

      {toDelete && (
        <ConfirmDialog
          danger
          title={t("evalsTab.deleteConfirmTitle", { name: toDelete.name })}
          body={
            <>
              {t("evalsTab.deleteConfirmBody")}
              {remove.isError && (
                <div role="alert" style={s.error}>
                  {t("evalsTab.deleteFailed")}
                </div>
              )}
            </>
          }
          confirmLabel={t("evalsTab.deleteConfirm")}
          pending={remove.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
        />
      )}
    </div>
  );
}
