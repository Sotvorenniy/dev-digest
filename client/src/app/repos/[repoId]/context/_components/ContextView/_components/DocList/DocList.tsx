"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { ProjectContextDoc } from "@/lib/types";
import { s } from "../../styles";

/** Left pane: one selectable row per doc, plus the files/tokens footer. */
export function DocList({
  docs,
  totalTokens,
  selected,
  onSelect,
}: {
  docs: ProjectContextDoc[];
  totalTokens: number;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("context");
  return (
    <div style={{ ...s.box, ...s.listPane }}>
      <div style={s.list} role="group" aria-label={t("listLabel")}>
        {docs.map((d) => (
          <button
            key={d.path}
            type="button"
            data-context-doc={d.path}
            aria-current={selected === d.path ? "true" : undefined}
            title={d.path}
            onClick={() => onSelect(d.path)}
            style={s.row(selected === d.path)}
          >
            <span style={s.rowPath}>{d.path}</span>
            <Badge>{d.type}</Badge>
            <span style={s.rowTokens}>{t("tokens", { count: d.tokens })}</span>
          </button>
        ))}
      </div>
      <div style={s.footer}>{t("footer", { files: docs.length, tokens: totalTokens })}</div>
    </div>
  );
}
