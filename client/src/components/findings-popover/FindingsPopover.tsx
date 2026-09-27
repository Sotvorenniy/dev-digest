/* FindingsPopover — wraps a trigger (the severity chips) and shows a read-only
   "N FINDINGS IN THIS RUN" panel while it is hovered. Two hosts: the PR list's
   FINDINGS column and each run tile on the PR timeline. Preview only — no
   Accept/Dismiss, no links, no buttons of any kind; acting on a finding
   happens in the Review runs accordion. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  type Severity,
  type Category,
} from "@devdigest/ui";
import { CLOSE_DELAY_MS } from "./constants";
import { lineLabel, panelPosition } from "./helpers";
import type { FindingPreviewLike } from "./types";
import { s } from "./styles";

export function FindingsPopover({
  findings,
  children,
}: {
  findings: FindingPreviewLike[];
  /** The hover trigger — normally the row's SeverityChips. */
  children: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const hostRef = React.useRef<HTMLSpanElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  const show = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }, []);
  // Delayed, so crossing the gap from the chips to the panel does not dismiss it.
  const hide = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, []);
  React.useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Fixed positioning needs viewport coordinates, and they move with the page.
  React.useLayoutEffect(() => {
    if (!open) return;
    const measure = () => setRect(hostRef.current?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  const showPanel = open && rect != null && findings.length > 0 && typeof document !== "undefined";

  return (
    <span
      ref={hostRef}
      data-findings-trigger=""
      style={s.wrap}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {showPanel &&
        createPortal(
          <div
            onMouseEnter={show}
            onMouseLeave={hide}
            // The hosts are rows whose own onClick navigates — a click that
            // lands in the panel (selecting text, nudging the scrollbar) must
            // not follow it.
            onClick={(e) => e.stopPropagation()}
            style={{
              ...s.panel,
              ...panelPosition(rect, { w: window.innerWidth, h: window.innerHeight }),
            }}
          >
            <div style={s.header}>
              <Icon.AlertOctagon size={13} />
              {/* Counted off the very array rendered below, so the header can
                  never disagree with the rows behind it. */}
              {t("list.findingsPopover.title", { count: findings.length })}
            </div>
            <div style={s.scroll}>
              {findings.map((f, i) => (
                <div
                  key={f.id}
                  style={i === findings.length - 1 ? { ...s.row, ...s.lastRow } : s.row}
                >
                  <div style={s.titleRow}>
                    <SeverityBadge severity={f.severity as Severity} compact />
                    <span style={s.title}>{f.title}</span>
                    <CategoryTag category={f.category as Category} />
                  </div>
                  <div style={s.metaRow}>
                    <span className="mono" style={s.file}>
                      {f.file}:{lineLabel(f)}
                    </span>
                    <ConfidenceNum value={f.confidence} />
                  </div>
                  <div style={s.rationale}>{f.rationale}</div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}

export default FindingsPopover;
