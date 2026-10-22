/* Kept in src/components (not the Evals tab) because SPEC-07 reuses it.
   EvalRunHistory — an agent's eval runs (newest first, max 20) with a labelled
   checkbox per finished run; Compare opens once exactly two are checked. */
"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Checkbox } from "@devdigest/ui";
import type { EvalSetRun } from "@devdigest/shared";
import { formatCost } from "@/components/run-cost-badge";
import { formatPct } from "@/lib/eval-metrics";
import { COMPARE_SELECTION_SIZE } from "./constants";
import { isFinished } from "@/lib/eval-metrics";
import { toggleSelection, visibleRuns } from "./helpers";
import { s } from "./styles";
import { CompareRunsDialog } from "./_components/CompareRunsDialog";

export function EvalRunHistory({ runs, agentName }: { runs: EvalSetRun[]; agentName: string }) {
  const t = useTranslations("eval");
  const locale = useLocale();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState(false);

  const rows = visibleRuns(runs);
  const picked = rows.filter((r) => selected.includes(r.id));
  const pair = picked.length === COMPARE_SELECTION_SIZE ? ([picked[0]!, picked[1]!] as [EvalSetRun, EvalSetRun]) : null;
  const when = (iso: string) => new Date(iso).toLocaleString(locale);

  return (
    <section data-eval-run-history style={s.root} aria-label={t("compare.history")}>
      <div style={s.header}>
        <h3 style={s.heading} title={agentName}>
          {t("compare.history")}
        </h3>
        <Button kind="secondary" size="sm" disabled={!pair} onClick={() => setComparing(true)}>
          {t("compare.compareButton")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <div style={s.empty}>{t("compare.noRuns")}</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, ...s.checkCol }} />
              <th style={s.th}>{t("compare.colVersion")}</th>
              <th style={s.th}>{t("compare.colStarted")}</th>
              <th style={s.th}>{t("compare.colStatus")}</th>
              <th style={s.th}>{t("compare.colPassed")}</th>
              <th style={s.th}>{t("compare.colRecall")}</th>
              <th style={s.th}>{t("compare.colPrecision")}</th>
              <th style={s.th}>{t("compare.colCitation")}</th>
              <th style={s.th}>{t("compare.colCost")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-eval-run-row={r.id}>
                <td style={{ ...s.td, ...s.checkCol }}>
                  {isFinished(r) && (
                    <Checkbox
                      checked={selected.includes(r.id)}
                      onChange={() => setSelected((cur) => toggleSelection(cur, r.id, COMPARE_SELECTION_SIZE))}
                      label={
                        <span style={s.srOnly}>
                          {t("compare.selectRun", { version: r.agent_version, time: when(r.started_at) })}
                        </span>
                      }
                    />
                  )}
                </td>
                <td style={s.td} title={`v${r.agent_version}`}>{`v${r.agent_version}`}</td>
                <td style={s.td} title={when(r.finished_at ?? r.started_at)}>{when(r.finished_at ?? r.started_at)}</td>
                <td style={s.td}>{t(`runStatus.${r.status}`)}</td>
                <td style={s.td}>{`${r.cases_passed} / ${r.cases_total}`}</td>
                <td style={s.td}>{formatPct(r.recall)}</td>
                <td style={s.td}>{formatPct(r.precision)}</td>
                <td style={s.td}>{formatPct(r.citation_accuracy)}</td>
                <td style={s.td}>{formatCost(r.cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {comparing && pair && <CompareRunsDialog runs={pair} onClose={() => setComparing(false)} />}
    </section>
  );
}
