"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { formatCost } from "@/components/run-cost-badge/helpers";
import { formatDuration } from "@/lib/agent-metrics";
import type { AgentColumn } from "@/lib/types";
import { s } from "../../styles";
import { ScoreRing } from "../ScoreRing";

/** One agent's column: status (live region), score, cost, findings as plain text, trace button. */
export function AgentColumnCard({ column, onViewTrace }: { column: AgentColumn; onViewTrace: () => void }) {
  const t = useTranslations("runs");
  const failed = column.status === "failed" || column.status === "cancelled";
  return (
    <div style={s.column} data-agent-column={column.agent_id}>
      <div style={s.colHead}>
        <span style={s.name}>{column.agent_name}</span>
        <ScoreRing score={column.score} />
      </div>
      <div aria-live="polite" style={s.muted} data-column-status={column.status}>
        {t(`column.status.${column.status}`)}
      </div>
      {failed && column.error && <div style={s.error}>{column.error}</div>}
      <div style={s.row}>
        <span style={s.muted}>{formatDuration(column.duration_ms)}</span>
        <span style={s.muted}>{formatCost(column.cost_usd)}</span>
        <span style={s.muted}>{t("column.findingsCount", { count: column.findings.length })}</span>
      </div>
      {column.findings.length === 0 ? (
        <div style={s.muted}>{t("column.noFindings")}</div>
      ) : (
        <ul style={s.list}>
          {column.findings.map((f) => (
            <li key={f.id} style={s.listItem} title={f.title}>
              {f.title}
            </li>
          ))}
        </ul>
      )}
      <span data-view-trace>
        <Button kind="secondary" size="sm" disabled={!column.run_id} onClick={onViewTrace}>
          {t("viewTrace")}
        </Button>
      </span>
    </div>
  );
}
