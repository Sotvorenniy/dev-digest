"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn, Markdown, Skeleton } from "@devdigest/ui";
import { useContextDoc } from "@/lib/hooks";
import { s } from "../../styles";

/** Inline read-only preview of one doc under the picker list (Markdown
 *  primitive, no raw HTML). */
export function DocPreviewPanel({
  repoId,
  path,
  onClose,
}: {
  repoId: string;
  path: string;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError } = useContextDoc(repoId, path);
  return (
    <div style={s.panel} data-context-preview-panel>
      <div style={s.panelHeader}>
        <span style={s.panelPath}>{path}</span>
        <IconBtn icon="X" label={t("picker.closePreview")} size={28} onClick={onClose} />
      </div>
      {isLoading ? (
        <Skeleton height={80} />
      ) : isError ? (
        <p role="alert" style={s.panelMessage}>
          {t("previewError")}
        </p>
      ) : (
        <div style={s.panelBody}>
          <Markdown>{data?.content}</Markdown>
        </div>
      )}
    </div>
  );
}
