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
        const href = reviewFocusHref(repoId, prNumber, item.file, item.line);
        const label = `${item.file}:${item.line}`;
        return (
          <li key={`${item.file}:${item.line}:${i}`} data-review-focus>
            {href ? (
              <Link
                href={href}
                className="mono"
                style={s.focusLink}
                aria-label={t("focusItem", { file: item.file, line: item.line })}
              >
                {label}
              </Link>
            ) : (
              <span className="mono">{label}</span>
            )}{" "}
            <span style={s.focusReason}>{item.reason}</span>
          </li>
        );
      })}
    </ol>
  );
}
