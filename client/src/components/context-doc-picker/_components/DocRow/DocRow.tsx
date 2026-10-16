"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn } from "@devdigest/ui";
import type { PickerRow } from "../../helpers";
import { s } from "../../styles";

/** One picker row. Attached rows also get a drag handle: drag the row, or focus
 *  the handle and press ArrowUp / ArrowDown, to move it in the attach order. */
export function DocRow({
  row,
  attached,
  saving,
  dragging,
  onToggle,
  onPreview,
  reorder,
}: {
  row: PickerRow;
  attached: boolean;
  saving: boolean;
  dragging: boolean;
  onToggle: () => void;
  onPreview: () => void;
  /** Present only for attached rows. */
  reorder?: {
    onDragStart: () => void;
    onDragEnd: () => void;
    onDrop: () => void;
    onMove: (delta: -1 | 1) => void;
  };
}) {
  const t = useTranslations("context");
  const [over, setOver] = React.useState(false);

  const dnd = reorder && {
    draggable: !saving,
    onDragStart: (e: React.DragEvent) => {
      // Firefox only starts a drag when data is set.
      e.dataTransfer?.setData("text/plain", row.path);
      reorder.onDragStart();
    },
    onDragEnd: reorder.onDragEnd,
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      reorder.onDrop();
    },
  };

  return (
    <div
      data-context-row={row.path}
      data-context-missing={row.missing ? "" : undefined}
      style={s.row(attached, dragging, over)}
      {...dnd}
    >
      {reorder && (
        <button
          type="button"
          data-context-drag-handle=""
          aria-label={t("picker.reorder", { path: row.path })}
          title={t("picker.reorder", { path: row.path })}
          disabled={saving}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            reorder.onMove(e.key === "ArrowUp" ? -1 : 1);
          }}
          style={s.handle}
        >
          <Icon.ChevronsUpDown size={14} />
        </button>
      )}
      <input
        type="checkbox"
        aria-label={row.path}
        checked={attached}
        disabled={saving}
        onChange={onToggle}
        style={s.checkbox}
      />
      <span style={s.path} title={row.path}>
        {row.path}
      </span>
      {row.missing ? <Badge>{t("picker.missing")}</Badge> : row.type && <Badge>{row.type}</Badge>}
      {row.tokens != null && <span style={s.tokens}>{t("tokens", { count: row.tokens })}</span>}
      {!row.missing && (
        <IconBtn icon="Eye" size={28} label={t("picker.preview", { path: row.path })} onClick={onPreview} />
      )}
    </div>
  );
}
