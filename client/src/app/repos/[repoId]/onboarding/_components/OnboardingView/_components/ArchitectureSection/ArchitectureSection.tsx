"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { OnboardingSections } from "@devdigest/shared";
import { s } from "../../styles";

/** Summary (markdown, no raw HTML) plus nodes and edges as a plain-text alternative to a diagram. */
export function ArchitectureSection({ architecture }: { architecture: OnboardingSections["architecture"] }) {
  const t = useTranslations("onboarding");
  const { summary, nodes, edges } = architecture;
  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <div>
      {summary ? <Markdown>{summary}</Markdown> : <p style={s.empty}>{t("architecture.noSummary")}</p>}
      {nodes.length > 0 && (
        <div role="group" aria-label={t("architecture.diagramAlt")}>
          <div style={s.subhead}>{t("architecture.nodesLabel")}</div>
          <ul style={s.plainList}>
            {nodes.map((n) => (
              <li key={n.id}>
                {n.label}
                {n.path ? <> — <code>{n.path}</code></> : null}
              </li>
            ))}
          </ul>
          {edges.length > 0 && (
            <>
              <div style={s.subhead}>{t("architecture.edgesLabel")}</div>
              <ul style={s.plainList}>
                {edges.map((e) => (
                  <li key={`${e.from}->${e.to}`}>
                    {t("architecture.edge", { from: labelOf(e.from), to: labelOf(e.to) })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
