"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Markdown, Skeleton } from "@devdigest/ui";
import { useContextDoc } from "@/lib/hooks";
import { previewErrorKey } from "../../helpers";
import { s } from "../../styles";

/** Right pane: read-only rendered preview of the selected doc. Content is
 *  rendered through the vendored Markdown primitive (no raw HTML). */
export function DocPreview({
  repoId,
  path,
  usedBy,
}: {
  repoId: string;
  path: string | null;
  usedBy: number;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError, error } = useContextDoc(repoId, path);

  return (
    <div style={{ ...s.box, ...s.previewPane }} data-context-preview>
      {!path ? (
        <p style={s.previewMessage}>{t("selectDoc")}</p>
      ) : isLoading ? (
        <Skeleton height={160} />
      ) : isError ? (
        <p role="alert" style={s.previewMessage}>
          {t(previewErrorKey(error))}
        </p>
      ) : data ? (
        <>
          <div style={s.previewHeader}>
            <span style={s.previewPath}>{data.path}</span>
            <Badge>{data.type}</Badge>
            <span style={s.previewMeta}>{t("usedBy", { count: usedBy })}</span>
          </div>
          <div style={s.previewBody}>
            <Markdown>{data.content}</Markdown>
          </div>
        </>
      ) : null}
    </div>
  );
}
