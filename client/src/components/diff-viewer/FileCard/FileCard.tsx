/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type ClaimScroll, type DiffFocus, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, fs, chevronFor } from "../styles";
import { lineKey } from "../comments";
import { partitionFindings, worstSeverity, type DiffFindingApi } from "../findings";
import { InlineFinding } from "../InlineFinding";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
  focus,
  claimScroll,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  focus?: DiffFocus;
  claimScroll?: ClaimScroll;
}) {
  const t = useTranslations("shell");
  const isFocusFile = focus?.file === file.path;
  const focusLine = isFocusFile ? (focus?.line ?? null) : null;
  // A manual toggle wins; otherwise the focused file is always open.
  const [manualOpen, setManualOpen] = React.useState<boolean | null>(null);
  const open = manualOpen ?? (isFocusFile || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES);
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const focusLineRef = React.useRef<HTMLDivElement>(null);
  // The focused row is a non-deleted line carrying the requested new-side number.
  const focusIdx = React.useMemo(
    () => (focusLine === null ? -1 : lines.findIndex((l) => l.kind !== "del" && l.kind !== "hunk" && l.newNo === focusLine)),
    [lines, focusLine],
  );

  // Scroll once per (file, line) pair (claimScroll dedupes across re-renders and
  // remounts). Keyed on primitives so a new `focus` object identity never re-fires it.
  const focusFile = isFocusFile ? file.path : null;
  const nLines = lines.length;
  React.useEffect(() => {
    if (!focusFile || !claimScroll) return;
    if (!claimScroll(`${focusFile}:${focusLine ?? ""}`)) return;
    const target = focusIdx >= 0 ? focusLineRef.current : headerRef.current;
    (target ?? headerRef.current)?.scrollIntoView?.({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFile, focusLine, nLines]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  // Current findings for this file: anchored ones render under their line, the
  // rest at the end of the body. All of them count toward the header dot.
  const fileFindings = findings?.byPath.get(file.path);
  const { matched: findingsByLine, unanchored } = React.useMemo(() => {
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionFindings(fileFindings ?? [], renderedKeys);
  }, [fileFindings, lines]);
  const worst = worstSeverity(fileFindings ?? []);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard} data-focus-file={isFocusFile ? "" : undefined}>
      <div ref={headerRef} onClick={() => setManualOpen(!open)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {worst && (
          <span
            data-file-finding-dot={worst}
            title={t("diffViewer.fileHasFindings")}
            aria-label={t("diffViewer.fileHasFindings")}
            style={fs.dot(worst)}
          />
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ref={i === focusIdx ? focusLineRef : undefined}
                focused={i === focusIdx}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={findings}
                lineFindings={ln.kind !== "del" && ln.kind !== "hunk" ? findingsByLine.get(lineKey("RIGHT", ln.newNo) ?? "") : undefined}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && (commenting?.showComments ?? true) && unanchored.length > 0 && (
            <div style={fs.unanchoredWrap}>
              {unanchored.map((fd) => (
                <InlineFinding
                  key={fd.id}
                  finding={fd}
                  pending={findings.pendingId === fd.id}
                  onAction={(action) => findings.onAction(fd, action)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
