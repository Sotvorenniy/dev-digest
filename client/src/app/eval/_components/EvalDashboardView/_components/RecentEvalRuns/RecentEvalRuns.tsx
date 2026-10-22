"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import type { EvalRecentRun } from "@/lib/types";
import { formatPct } from "@/lib/eval-metrics";
import { isRunning, runTime } from "../../helpers";
import { s } from "../../styles";

/** The newest runs across agents, in server order. A running run shows its state instead of metrics. */
export function RecentEvalRuns({ runs }: { runs: EvalRecentRun[] }) {
  const t = useTranslations("eval");
  const locale = useLocale();

  return (
    <table style={s.table} aria-label={t("dashboard.recentRunsAll")}>
      <thead>
        <tr>
          <th style={s.th}>{t("dashboard.table.agent")}</th>
          <th style={s.th}>{t("dashboard.table.version")}</th>
          <th style={s.th}>{t("dashboard.table.ranAt")}</th>
          <th style={s.th}>{t("dashboard.table.pass")}</th>
          <th style={s.th}>{t("dashboard.table.recall")}</th>
          <th style={s.th}>{t("dashboard.table.precision")}</th>
          <th style={s.th}>{t("dashboard.table.citation")}</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const when = new Date(runTime(r)).toLocaleString(locale);
          return (
            <tr key={r.id} data-eval-recent-run={r.id}>
              <td style={s.td} title={r.agent_name}>
                {r.agent_name}
              </td>
              <td style={s.td}>{t("dashboard.version", { version: r.agent_version })}</td>
              <td style={s.td} title={when}>
                {when}
              </td>
              {isRunning(r) ? (
                <td style={s.td} colSpan={4}>
                  {t("dashboard.runningState")}
                </td>
              ) : (
                <>
                  <td style={s.td}>{`${r.cases_passed} / ${r.cases_total}`}</td>
                  <td style={s.td}>{formatPct(r.recall)}</td>
                  <td style={s.td}>{formatPct(r.precision)}</td>
                  <td style={s.td}>{formatPct(r.citation_accuracy)}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default RecentEvalRuns;
