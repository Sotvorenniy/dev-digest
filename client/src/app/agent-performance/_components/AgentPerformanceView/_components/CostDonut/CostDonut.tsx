"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PieChart, Pie, Cell } from "recharts";
import { formatCost } from "@/components/run-cost-badge";
import type { PerfCostSegment } from "@/lib/types";
import { DONUT_COLORS } from "../../constants";
import { withPercents } from "../../helpers";
import { s } from "../../styles";

const SIZE = 120;
const STROKE = 20;

/** Cost ring plus a text legend; colour is never the only carrier of a segment's identity. */
export function CostDonut({ title, segments }: { title: string; segments: PerfCostSegment[] }) {
  const t = useTranslations("agentPerformance");
  const labelOf = (seg: PerfCostSegment): string => {
    if (seg.kind === "deleted_agent") return t("table.deletedAgent");
    if (seg.kind === "unknown_model") return t("breakdown.unknownModel");
    return seg.label ?? "";
  };
  const colorOf = (i: number) => DONUT_COLORS[i % DONUT_COLORS.length]!;
  const items = withPercents(segments);
  const chartData = segments.map((seg) => ({ label: labelOf(seg), value: seg.value }));

  return (
    <div style={s.donut}>
      <h4 style={s.donutTitle}>{title}</h4>
      {segments.length === 0 ? (
        <p style={s.noCost}>{t("breakdown.noCost")}</p>
      ) : (
        <div style={s.donutBody}>
          <div aria-hidden="true" style={{ width: SIZE, height: SIZE, flexShrink: 0 }}>
            <PieChart width={SIZE} height={SIZE}>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={(SIZE - STROKE) / 2 - STROKE / 2}
                outerRadius={(SIZE - STROKE) / 2 + STROKE / 2}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
                stroke="none"
              >
                {segments.map((seg, i) => (
                  <Cell key={`${seg.kind}-${seg.agent_id ?? seg.label ?? i}`} fill={colorOf(i)} />
                ))}
              </Pie>
            </PieChart>
          </div>
          <ul style={s.legend}>
            {items.map(({ segment, percent }, i) => {
              const label = labelOf(segment);
              return (
                <li key={`${segment.kind}-${segment.agent_id ?? segment.label ?? i}`} data-cost-segment style={s.legendItem}>
                  <span aria-hidden="true" style={{ ...s.swatch, background: colorOf(i) }} />
                  <span style={s.legendText} title={label}>
                    {t("breakdown.legendItem", { label, amount: formatCost(segment.value), percent })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
