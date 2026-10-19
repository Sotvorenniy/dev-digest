"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PieChart, Pie, Cell } from "recharts";
import type { AgentStats } from "@/lib/types";
import { CATEGORY_COLORS, CATEGORY_ORDER } from "../../constants";
import { categoryLegend, isSmallSample } from "../../helpers";
import { s } from "../../styles";

const SIZE = 120;
const STROKE = 20;

/** Category ring plus a text legend; colour is never the only carrier of a category's identity. */
export function CategoryDonut({ stats }: { stats: AgentStats }) {
  const t = useTranslations("agentStats");
  const total = stats.findings_total;
  const rows = categoryLegend(stats.findings_by_category, total);
  const colorOf = (category: (typeof CATEGORY_ORDER)[number]) => CATEGORY_COLORS[CATEGORY_ORDER.indexOf(category)]!;
  const chartData = rows.filter((r) => r.count > 0).map((r) => ({ name: r.category, value: r.count }));

  return (
    <section data-category-donut aria-label={t("category.title")} style={s.panel}>
      <h4 style={s.panelTitle}>{t("category.title")}</h4>
      <div style={s.donutBody}>
        <div style={s.donutRing}>
          <div aria-hidden="true" style={{ width: SIZE, height: SIZE }}>
            <PieChart width={SIZE} height={SIZE}>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={(SIZE - STROKE) / 2 - STROKE / 2}
                outerRadius={(SIZE - STROKE) / 2 + STROKE / 2}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
                stroke="none"
              >
                {chartData.map((d) => (
                  <Cell key={d.name} fill={colorOf(d.name)} />
                ))}
              </Pie>
            </PieChart>
          </div>
          <span className="tnum" style={s.donutCenter} aria-label={t("category.centerAlt", { count: total })}>
            {total}
          </span>
        </div>
        <ul style={s.legendList}>
          {rows.map((r) => {
            const category = t(`category.names.${r.category}`);
            return (
              <li key={r.category} data-category-row={r.category} style={s.legendItem}>
                <span aria-hidden="true" style={{ ...s.swatch, background: colorOf(r.category) }} />
                <span>
                  {r.percent == null
                    ? t("category.legendZero", { category, count: r.count })
                    : t("category.legendItem", { category, count: r.count, percent: `${r.percent}%` })}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {isSmallSample(total) && <p style={s.smallSample}>{t("category.smallSample")}</p>}
    </section>
  );
}
