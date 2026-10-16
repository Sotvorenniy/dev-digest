"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, TextInput } from "@devdigest/ui";
import type { ProjectContextDoc } from "@/lib/types";
import { DocPreviewPanel } from "./_components/DocPreviewPanel";
import { DocRow } from "./_components/DocRow";
import { CONTEXT_TOKEN_WARN } from "./constants";
import { buildRows, filterRows, moveBy, movePath, sumAttachedTokens, toggleAttached } from "./helpers";
import { s } from "./styles";

/** Checklist of a repo's context docs for an agent or skill. Attached docs come
 *  first in attach order (= prompt order) and can be dragged to reorder; the
 *  rest follow. Every toggle or move calls `onChange` with the whole next
 *  attach-order list (full-replace PUT, last save wins). Attached docs missing
 *  on disk stay as checked "missing" rows. */
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
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const filterId = React.useId();

  const rows = buildRows(docs, attached, missing);
  const visible = filterRows(rows, filter);
  const attachedSet = new Set(attached);
  const byPath = new Map(visible.map((r) => [r.path, r]));
  const attachedRows = attached.flatMap((p) => byPath.get(p) ?? []);
  const availableRows = visible.filter((r) => !attachedSet.has(r.path));
  const tokens = sumAttachedTokens(docs, attached);
  const overBudget = tokens > CONTEXT_TOKEN_WARN;
  const countText =
    header === "ofTotal"
      ? t("picker.attachedOfTotal", { attached: attached.length, total: docs.length })
      : t("picker.attachedCount", { attached: attached.length });

  const toggle = (path: string) => {
    if (saving) return;
    onChange(toggleAttached(attached, path));
  };

  const reorder = (next: string[]) => {
    if (saving || next === attached) return;
    onChange(next);
  };

  const renderRow = (r: (typeof rows)[number], withReorder: boolean) => (
    <DocRow
      key={r.path}
      row={r}
      attached={attachedSet.has(r.path)}
      saving={saving}
      dragging={dragPath === r.path}
      onToggle={() => toggle(r.path)}
      onPreview={() => setPreviewPath(r.path)}
      reorder={
        withReorder
          ? {
              onDragStart: () => setDragPath(r.path),
              onDragEnd: () => setDragPath(null),
              onDrop: () => {
                if (dragPath) reorder(movePath(attached, dragPath, r.path));
                setDragPath(null);
              },
              onMove: (delta) => reorder(moveBy(attached, r.path, delta)),
            }
          : undefined
      }
    />
  );

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
        <>
          {attachedRows.length > 0 && (
            <section style={s.section} data-context-attached-list="">
              <h3 style={s.sectionTitle}>{t("picker.attachedSection")}</h3>
              <p style={s.sectionHint}>{t("picker.orderHint")}</p>
              <div style={s.list}>
                {attachedRows.map((r) => renderRow(r, true))}
              </div>
            </section>
          )}
          {availableRows.length > 0 && (
            <section style={s.section} data-context-available-list="">
              {attachedRows.length > 0 && <h3 style={s.sectionTitle}>{t("picker.availableSection")}</h3>}
              <div style={s.list}>{availableRows.map((r) => renderRow(r, false))}</div>
            </section>
          )}
        </>
      )}

      {previewPath && (
        <DocPreviewPanel repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />
      )}

      <div style={s.footer(overBudget)} aria-live="polite" data-context-over-budget={overBudget ? "" : undefined}>
        {t("picker.footerTokens", { tokens })}
      </div>
      {overBudget && (
        <div role="status" style={s.budgetWarning} data-context-budget-warning="">
          {t("picker.overBudget", { tokens, limit: CONTEXT_TOKEN_WARN })}
        </div>
      )}
    </div>
  );
}
