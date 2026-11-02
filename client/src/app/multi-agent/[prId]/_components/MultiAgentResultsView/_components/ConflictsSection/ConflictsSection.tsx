"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, SeverityBadge } from "@devdigest/ui";
import type { AgentColumn, Conflict } from "@/lib/types";
import { cellFor, visibleConflicts } from "../../helpers";
import { s } from "../../styles";

/** Where agents disagree: one row per contended location, one cell per agent column. */
export function ConflictsSection({ columns, conflicts }: { columns: AgentColumn[]; conflicts: Conflict[] }) {
  const t = useTranslations("runs");
  const [only, setOnly] = React.useState(false);
  const rows = visibleConflicts(conflicts, only);

  return (
    <div style={s.section} data-conflicts>
      <div style={s.colHead}>
        <span style={s.sectionTitle}>{t("conflicts.title")}</span>
        <Checkbox checked={only} onChange={setOnly} label={t("conflicts.onlyConflicts")} />
      </div>
      {rows.length === 0 ? (
        <div style={s.muted}>{t("conflicts.empty")}</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.cell}>{t("conflicts.title")}</th>
                {columns.map((c) => (
                  <th key={c.agent_id} style={s.cell}>
                    {c.agent_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.group_key} data-conflict-row={c.group_key}>
                  <td style={s.cell}>
                    <div>{c.title}</div>
                    <div style={s.muted}>
                      {c.file}:{c.line}
                    </div>
                  </td>
                  {columns.map((col) => {
                    const take = cellFor(c, col.agent_id);
                    return (
                      <td key={col.agent_id} style={s.cell} data-conflict-cell={col.agent_id}>
                        {take &&
                          (take.verdict === "ignored" ? (
                            <span style={s.muted}>{t("conflicts.didNotFlag")}</span>
                          ) : (
                            <div style={s.take}>
                              <div style={s.takeHead}>
                                <SeverityBadge severity={take.verdict} compact />
                                <span>{t(`severity.${take.verdict.toLowerCase()}`)}</span>
                              </div>
                              {take.note && <div style={s.muted}>{take.note}</div>}
                            </div>
                          ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
