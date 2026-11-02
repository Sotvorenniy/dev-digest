"use client";

import React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import type { EvalAgentSummary } from "@/lib/types";
import { formatPct } from "@/lib/eval-metrics";
import { runTime, sparklineAltValues } from "../../helpers";
import { s } from "../../styles";

/** One agent: a single keyboard-reachable link to its eval page. */
export function AgentEvalRow({ agent }: { agent: EvalAgentSummary }) {
  const t = useTranslations("eval");
  const locale = useLocale();
  const { latest, recall_series } = agent;

  return (
    <Link
      href={`/eval/agents/${agent.agent_id}`}
      aria-label={t("dashboard.agentRowLabel", { name: agent.name })}
      data-eval-agent-row={agent.agent_id}
      style={s.row}
    >
      <span style={s.name} title={agent.name}>
        {agent.name}
      </span>
      <span style={s.model} title={agent.model}>
        {agent.model}
      </span>
      <span style={s.meta}>
        {latest ? (
          <>
            <span>
              {t("dashboard.lastRun", {
                version: latest.agent_version,
                time: new Date(runTime(latest)).toLocaleString(locale),
                passed: latest.cases_passed,
                total: latest.cases_total,
              })}
            </span>
            <span style={s.metrics}>
              <span>{`${t("dashboard.legend.recall")} ${formatPct(latest.recall)}`}</span>
              <span>{`${t("dashboard.legend.precision")} ${formatPct(latest.precision)}`}</span>
              <span>{`${t("dashboard.legend.citation")} ${formatPct(latest.citation_accuracy)}`}</span>
            </span>
          </>
        ) : (
          <span style={s.muted}>{t("dashboard.neverRun")}</span>
        )}
      </span>
      {recall_series.length > 0 ? (
        <span role="img" aria-label={t("dashboard.sparklineAlt", sparklineAltValues(recall_series))} style={s.spark}>
          {recall_series.length > 1 ? <Sparkline data={recall_series} /> : <span aria-hidden="true">{formatPct(recall_series[0])}</span>}
        </span>
      ) : (
        <span style={s.spark} />
      )}
    </Link>
  );
}

export default AgentEvalRow;
