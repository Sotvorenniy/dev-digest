"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { FindingCard } from "@/components/finding-card";
import { formatCost } from "@/components/run-cost-badge/helpers";
import { formatDuration } from "@/lib/agent-metrics";
import type { AgentColumn } from "@/lib/types";
import type { FindingActionKind } from "@devdigest/shared";
import { s } from "../../styles";

/** One tab per agent; the selected tab shows a summary card and its findings. */
export function TabsView({
  columns,
  pending,
  onAction,
  onViewTrace,
}: {
  columns: AgentColumn[];
  pending: boolean;
  onAction: (findingId: string, action: FindingActionKind) => void;
  onViewTrace: (column: AgentColumn) => void;
}) {
  const t = useTranslations("runs");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const column = columns.find((c) => c.agent_id === selectedId) ?? columns[0];
  if (!column) return null;

  return (
    <div style={s.panel}>
      <div role="tablist" style={s.tabs}>
        {columns.map((c) => (
          <button
            key={c.agent_id}
            type="button"
            role="tab"
            aria-selected={c.agent_id === column.agent_id}
            data-agent-tab={c.agent_id}
            style={s.tabBtn(c.agent_id === column.agent_id)}
            onClick={() => setSelectedId(c.agent_id)}
          >
            {c.agent_name} · {c.score ?? t("column.noScore")}
          </button>
        ))}
      </div>
      <div role="tabpanel" style={s.panel} data-agent-panel={column.agent_id}>
        <div style={s.summaryCard}>
          <div style={s.colHead}>
            <span style={s.name}>{column.agent_name}</span>
            <span style={s.muted}>
              {column.score == null ? t("column.noScore") : t("column.score", { score: column.score })}
            </span>
          </div>
          <div style={s.summaryText}>{column.summary || t("tabs.noSummary")}</div>
          <div style={s.row}>
            <span style={s.muted}>{formatDuration(column.duration_ms)}</span>
            <span style={s.muted}>{formatCost(column.cost_usd)}</span>
          </div>
          <span data-view-trace>
            <Button kind="secondary" size="sm" disabled={!column.run_id} onClick={() => onViewTrace(column)}>
              {t("viewTrace")}
            </Button>
          </span>
        </div>
        {column.findings.length === 0 ? (
          <div style={s.muted}>{t("column.noFindings")}</div>
        ) : (
          column.findings.map((f) => (
            <FindingCard
              key={f.id}
              f={f}
              pending={pending}
              reviewAgentId={column.agent_id}
              onAction={(act) => onAction(f.id, act)}
            />
          ))
        )}
      </div>
    </div>
  );
}
