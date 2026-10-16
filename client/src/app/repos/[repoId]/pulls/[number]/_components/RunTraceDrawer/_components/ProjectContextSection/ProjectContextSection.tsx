/* ProjectContextSection — per-doc status/cost of the project context attached to
   a run. Included entries expand to the exact text sent (shown in a <pre>, never
   rendered as HTML — it is untrusted repo content). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ProjectContextEntry } from "@devdigest/shared";
import { s } from "../../styles";

function EntryRow({ entry }: { entry: ProjectContextEntry }) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState(false);
  const expandable = entry.status === "included" && entry.text != null;
  const head = (
    <>
      <span className="mono" style={s.pcPath}>
        {entry.path}
      </span>
      {entry.skill_name && <span style={s.pcMeta}>{t("trace.projectContext.skill", { name: entry.skill_name })}</span>}
      <span style={s.pcStatus}>{t(`trace.projectContext.status.${entry.status}`)}</span>
      {entry.tokens != null && (
        <span className="mono tnum" style={s.pcMeta}>
          {t("trace.projectContext.tokens", { count: entry.tokens })}
        </span>
      )}
    </>
  );
  return (
    <div style={s.pcEntry} data-project-context-entry={entry.path} data-project-context-status={entry.status}>
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-label={t(open ? "trace.projectContext.collapse" : "trace.projectContext.expand", { path: entry.path })}
          onClick={() => setOpen((o) => !o)}
          style={s.pcHead}
        >
          {head}
        </button>
      ) : (
        <div style={{ ...s.pcHead, ...s.pcHeadStatic }}>{head}</div>
      )}
      {expandable && open && (
        <pre className="mono" style={s.pcText}>
          {entry.text}
        </pre>
      )}
    </div>
  );
}

export function ProjectContextSection({ entries }: { entries: ProjectContextEntry[] }) {
  const t = useTranslations("runs");
  return (
    <div style={s.pcWrap}>
      <div style={s.pcTitle}>{t("trace.projectContext.title")}</div>
      {entries.map((e, i) => (
        <EntryRow key={`${e.origin}:${e.skill_name ?? ""}:${e.path}:${i}`} entry={e} />
      ))}
    </div>
  );
}
