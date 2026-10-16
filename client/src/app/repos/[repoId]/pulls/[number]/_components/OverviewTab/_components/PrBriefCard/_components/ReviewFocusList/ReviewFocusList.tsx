"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { BriefReviewFocusItem } from "@/lib/types";
import { reviewFocusHref } from "../../helpers";
import { s } from "../../styles";

interface ReviewFocusListProps {
  items: BriefReviewFocusItem[];
  repoId: string;
  prNumber: number;
}

export function ReviewFocusList({ items, repoId, prNumber }: ReviewFocusListProps) {
  const t = useTranslations("brief");
  return (
    <ol style={s.focusList}>
      {items.map((item, i) => {
        // Without a usable line the link still opens the file.
        const hasLine = typeof item.line === "number" && Number.isInteger(item.line) && item.line >= 1;
        const label = hasLine ? `${item.file}:${item.line}` : item.file;
        return (
          <li key={`${item.file}:${item.line}:${i}`} data-review-focus>
            <Link
              href={reviewFocusHref(repoId, prNumber, item.file, item.line)}
              className="mono"
              style={s.focusLink}
              aria-label={
                hasLine ? t("focusItem", { file: item.file, line: item.line }) : t("openFile", { file: item.file })
              }
            >
              {label}
            </Link>{" "}
            <span style={s.focusReason}>{item.reason}</span>
          </li>
        );
      })}
    </ol>
  );
}
