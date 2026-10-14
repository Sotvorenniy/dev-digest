"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, IconBtn, TextInput } from "@devdigest/ui";
import type { ProjectContextDoc } from "@/lib/types";
import { DocPreviewPanel } from "./_components/DocPreviewPanel";
import { buildRows, filterRows, sumAttachedTokens, toggleAttached } from "./helpers";
import { s } from "./styles";

/** Checklist of a repo's context docs for an agent or skill. Every toggle calls
 *  `onChange` with the whole next attach-order list (full-replace PUT, last save
 *  wins). Attached docs missing on disk stay as checked "missing" rows. */
export function ContextDocPicker({
  repoId,
  docs,
  attached,
  missing,
  onChange,
  saving,
  saveError = false,
  header,
}: {
  repoId: string;
  docs: ProjectContextDoc[];
  attached: string[];
  missing: string[];
  onChange: (next: string[]) => void;
  saving: boolean;
  /** True when the last save failed — the list shows server state again. */
  saveError?: boolean;
  header: "ofTotal" | "count";
}) {
  const t = useTranslations("context");
  const [filter, setFilter] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const filterId = React.useId();

  const rows = buildRows(docs, attached, missing);
  const visible = filterRows(rows, filter);
  const attachedSet = new Set(attached);
  const tokens = sumAttachedTokens(docs, attached);
  const countText =
    header === "ofTotal"
      ? t("picker.attachedOfTotal", { attached: attached.length, total: docs.length })
      : t("picker.attachedCount", { attached: attached.length });

  const toggle = (path: string) => {
    if (saving) return;
    onChange(toggleAttached(attached, path));
  };

  if (rows.length === 0) {
    return <EmptyState icon="FileText" title={t("picker.empty")} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header} aria-live="polite">
        <span style={s.count}>{countText}</span>
        {saving && <span style={s.count}>{t("picker.saving")}</span>}
      </div>

      {saveError && !saving && (
        <div role="alert" data-context-save-error="" style={s.saveError}>
          {t("picker.saveError")}
        </div>
      )}

      <div style={s.filter}>
        <label htmlFor={filterId} style={s.filterLabel}>
          {t("picker.filterLabel")}
        </label>
        <TextInput id={filterId} value={filter} onChange={setFilter} placeholder={t("picker.filterPlaceholder")} />
      </div>

      {visible.length === 0 ? (
        <div style={s.noMatch}>
          <span>{t("picker.noMatch")}</span>
          <Button kind="ghost" size="sm" onClick={() => setFilter("")}>
            {t("picker.clearFilter")}
          </Button>
        </div>
      ) : (
        <div style={s.list}>
          {visible.map((r) => {
            const isAttached = attachedSet.has(r.path);
            return (
              <div
                key={r.path}
                data-context-row={r.path}
                data-context-missing={r.missing ? "" : undefined}
                style={s.row(isAttached)}
              >
                <input
                  type="checkbox"
                  aria-label={r.path}
                  checked={isAttached}
                  disabled={saving}
                  onChange={() => toggle(r.path)}
                  style={s.checkbox}
                />
                <span style={s.path} title={r.path}>
                  {r.path}
                </span>
                {r.missing ? <Badge>{t("picker.missing")}</Badge> : r.type && <Badge>{r.type}</Badge>}
                {r.tokens != null && <span style={s.tokens}>{t("tokens", { count: r.tokens })}</span>}
                {!r.missing && (
                  <IconBtn
                    icon="Eye"
                    size={28}
                    label={t("picker.preview", { path: r.path })}
                    onClick={() => setPreviewPath(r.path)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewPath && (
        <DocPreviewPanel repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />
      )}

      <div style={s.footer} aria-live="polite">
        {t("picker.footerTokens", { tokens })}
      </div>
    </div>
  );
}
