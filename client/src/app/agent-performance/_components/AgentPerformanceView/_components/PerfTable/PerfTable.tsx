"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { AgentPerfRow } from "@/lib/types";
import { sortRows } from "../../helpers";
import { s } from "../../styles";
import { PerfRow } from "../PerfRow";

/** Per-agent table. Sorting is local (derived during render) and makes no request. */
export function PerfTable({ rows }: { rows: AgentPerfRow[] }) {
  const t = useTranslations("agentPerformance");
  const [dir, setDir] = React.useState<"desc" | "asc">("desc");
  const sorted = sortRows(rows, dir);
  const SortIcon = dir === "desc" ? Icon.ArrowDown : Icon.ArrowUp;

  return (
    <div style={s.tableWrap}>
      <table data-perf-table style={s.table}>
        <thead>
          <tr>
            <th scope="col" style={s.th}>{t("table.agent")}</th>
            <th scope="col" style={s.th}>{t("table.runs")}</th>
            <th scope="col" style={s.th}>
              {t("table.avgCost")} <span style={s.estimateTag}>{t("estimate.label")}</span>
            </th>
            <th scope="col" style={s.th}>{t("table.avgDuration")}</th>
            <th scope="col" style={s.th} aria-sort={dir === "desc" ? "descending" : "ascending"}>
              <button
                type="button"
                data-sort-accept
                style={s.sortButton}
                aria-label={t("table.sortAccept")}
                onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))}
              >
                {t("table.accept")}
                <SortIcon size={12} />
              </button>
            </th>
            <th scope="col" style={s.th}>{t("table.lastRun")}</th>
            <th scope="col" style={s.th}>{t("table.view")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <PerfRow key={row.agent_id ?? "deleted"} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
