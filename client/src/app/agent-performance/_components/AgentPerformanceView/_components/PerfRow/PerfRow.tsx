"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { formatCost } from "@/components/run-cost-badge";
import type { AgentPerfRow } from "@/lib/types";
import { formatDuration, formatPercent, formatRelativeTime, isSmallSample, trendDirection } from "../../helpers";
import { s } from "../../styles";

const DASH = "—";

export function PerfRow({ row }: { row: AgentPerfRow }) {
  const t = useTranslations("agentPerformance");
  const [expanded, setExpanded] = React.useState(false);
  const rowKey = row.agent_id ?? "deleted";
  const detailsId = `agent-performance-details-${rowKey}`;
  const name = row.agent_name ?? t("table.deletedAgent");
  const idle = row.runs === 0;
  const trend = idle ? null : trendDirection(row);
  const Chevron = expanded ? Icon.ChevronDown : Icon.ChevronRight;
  const TrendIcon = trend === "down" ? Icon.ArrowDown : Icon.ArrowUp;

  return (
    <>
      <tr data-agent-id={rowKey}>
        <td style={s.td}>
          <div style={s.agentCell}>
            <button
              type="button"
              style={s.expandButton}
              aria-expanded={expanded}
              aria-controls={detailsId}
              aria-label={t(expanded ? "table.collapse" : "table.expand", { name })}
              onClick={() => setExpanded((v) => !v)}
            >
              <Chevron size={14} />
            </button>
            <span style={s.agentName} title={name}>
              {name}
            </span>
          </div>
        </td>
        <td className="tnum" style={s.td}>
          {idle ? <span style={s.muted}>{t("table.noRunsInPeriod")}</span> : row.runs}
        </td>
        {idle ? (
          <>
            <td style={s.td}>{DASH}</td>
            <td style={s.td}>{DASH}</td>
            <td style={s.td}>{DASH}</td>
            <td style={s.td}>{DASH}</td>
          </>
        ) : (
          <>
            <td className="tnum" style={s.td}>
              {formatCost(row.avg_cost_usd)}
            </td>
            <td className="tnum" style={s.td}>
              {formatDuration(row.avg_latency_ms)}
            </td>
            <td style={s.td}>
              <div style={s.acceptCell}>
                <span className="tnum">{formatPercent(row.accept_rate)}</span>
                <span style={s.muted}>{t("decisions", { count: row.decided })}</span>
                {isSmallSample(row.decided) && (
                  <span data-small-sample>
                    <Badge>{t("table.smallSample", { count: row.decided })}</Badge>
                  </span>
                )}
                {trend && (
                  <span
                    role="img"
                    aria-label={t(trend === "up" ? "table.trendUp" : "table.trendDown")}
                    data-trend={trend}
                    style={trend === "up" ? s.trendUp : s.trendDown}
                  >
                    <TrendIcon size={14} />
                  </span>
                )}
              </div>
            </td>
            <td style={s.td}>{formatRelativeTime(row.last_run_at)}</td>
          </>
        )}
        <td style={s.td}>
          {row.agent_id != null && (
            <Link href={`/agents/${row.agent_id}`} aria-label={t("table.viewAgent", { name })} style={s.viewLink}>
              {t("table.view")}
            </Link>
          )}
        </td>
      </tr>
      {expanded && (
        <tr id={detailsId} data-agent-details>
          <td colSpan={7} style={s.detailsCell}>
            <div style={s.detailsGrid}>
              <div style={s.detailsGroup}>
                <span style={s.detailsHeading}>{t("details.severity")}</span>
                <ul style={s.detailsList}>
                  <li>{t("details.critical")}: {row.findings_by_severity.CRITICAL}</li>
                  <li>{t("details.warning")}: {row.findings_by_severity.WARNING}</li>
                  <li>{t("details.suggestion")}: {row.findings_by_severity.SUGGESTION}</li>
                </ul>
              </div>
              <div style={s.detailsGroup}>
                <ul style={s.detailsList}>
                  <li>{t("details.accepted")}: {row.accepted}</li>
                  <li>{t("details.dismissed")}: {row.dismissed}</li>
                  <li>{t("details.pending")}: {row.pending}</li>
                </ul>
              </div>
              <div style={s.detailsGroup}>
                <span style={s.detailsHeading}>
                  {t("details.costByModel")} <span style={s.estimateTag}>{t("estimate.label")}</span>
                </span>
                {row.cost_by_model.length === 0 ? (
                  <span>{t("details.noCost")}</span>
                ) : (
                  <ul style={s.detailsList}>
                    {row.cost_by_model.map((seg, i) => (
                      <li key={`${seg.kind}-${seg.label ?? i}`}>
                        {seg.kind === "unknown_model" ? t("breakdown.unknownModel") : seg.label}: {formatCost(seg.value)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
