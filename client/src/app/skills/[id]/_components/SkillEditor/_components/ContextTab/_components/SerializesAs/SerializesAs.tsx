"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ProjectContextDoc } from "@/lib/types";
import { groupForPrompt } from "./helpers";
import { s } from "./styles";

/** "Serializes as": how this skill's attached docs land in the review prompt —
 *  under `## Project context`, grouped specs → docs → insights → other, each
 *  doc as its own untrusted block labelled by path. */
export function SerializesAs({
  attached,
  docs,
  missing,
}: {
  attached: string[];
  docs: ProjectContextDoc[];
  missing: string[];
}) {
  const t = useTranslations("context");
  const groups = groupForPrompt(attached, docs, missing);
  const titleId = React.useId();

  return (
    <section style={s.wrap} data-context-serializes-as="" aria-labelledby={titleId}>
      <h3 id={titleId} style={s.title}>
        {t("serializes.title")}
      </h3>
      <p style={s.hint}>{t("serializes.hint")}</p>
      {groups.length === 0 ? (
        <p style={s.empty}>{t("serializes.empty")}</p>
      ) : (
        <div style={s.code}>
          <div style={s.heading}>## Project context</div>
          {groups.map((g) => (
            <div key={g.key} style={s.group} data-context-group={g.key}>
              <div>
                <span style={s.groupLabel}>{t(`serializes.groups.${g.key}`)}</span>{" "}
                <span style={s.groupCount}>· {t("serializes.groupCount", { count: g.items.length })}</span>
              </div>
              {g.items.map((it) => (
                <div key={it.path} style={s.item} data-context-group-item={it.path}>
                  {`<untrusted source="${it.path}">`}{" "}
                  <span style={s.meta}>
                    {it.missing ? t("picker.missing") : it.tokens != null ? t("tokens", { count: it.tokens }) : null}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
