/* Kept in src/components (not the Evals tab) because SPEC-07 reuses it.
   EvalMetricCards — app-local metric cards for an eval run (not the vendored
   MetricCard, which misreports small deltas). The delta is text with an explicit
   sign; a missing side shows "—" and no earlier run shows the no-delta note. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSetRun } from "@devdigest/shared";
import { deltaPoints, formatDeltaPoints, formatPct } from "@/lib/eval-metrics";
import { s } from "./styles";

export type EvalMetricKey = "recall" | "precision" | "citation" | "passed";

/** Rate of passed cases, or null for a run without cases. */
function passRate(run: EvalSetRun): number | null {
  return run.cases_total > 0 ? run.cases_passed / run.cases_total : null;
}

function metricValue(run: EvalSetRun, key: EvalMetricKey): number | null {
  switch (key) {
    case "recall":
      return run.recall;
    case "precision":
      return run.precision;
    case "citation":
      return run.citation_accuracy;
    case "passed":
      return passRate(run);
  }
}

export function EvalMetricCards({
  latest,
  previous,
  metrics,
}: {
  latest: EvalSetRun | null;
  previous: EvalSetRun | null;
  metrics: EvalMetricKey[];
}) {
  const t = useTranslations("eval");
  return (
    <div style={s.grid} data-eval-metric-cards>
      {metrics.map((key) => {
        const value = latest ? metricValue(latest, key) : null;
        const delta =
          latest && previous ? formatDeltaPoints(deltaPoints(value, metricValue(previous, key))) : null;
        return (
          <div key={key} data-eval-metric={key} style={s.card}>
            <span style={s.label}>{t(`evalsTab.metrics.${key}`)}</span>
            <span style={s.value}>
              {key === "passed" ? (latest ? `${latest.cases_passed} / ${latest.cases_total}` : "—") : formatPct(value)}
            </span>
            <span data-eval-delta={key} style={s.delta}>
              {delta ?? t("evalsTab.noDelta")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
