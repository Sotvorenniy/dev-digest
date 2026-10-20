"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentPerf } from "@/lib/types";
import { s } from "../../styles";
import { CostDonut } from "../CostDonut";

export function CostBreakdown({ data }: { data: AgentPerf }) {
  const t = useTranslations("agentPerformance");
  return (
    <section data-cost-breakdown style={s.breakdown}>
      <div style={s.breakdownHead}>
        <h3 style={s.breakdownTitle}>{t("breakdown.title")}</h3>
        <span style={s.estimateTag}>{t("estimate.label")}</span>
        <p style={s.breakdownNote}>{t("estimate.explanation")}</p>
      </div>
      <div style={s.donutGrid}>
        <CostDonut title={t("breakdown.byAgent")} segments={data.cost_by_agent} />
        <CostDonut title={t("breakdown.byModel")} segments={data.cost_by_model} />
      </div>
    </section>
  );
}
