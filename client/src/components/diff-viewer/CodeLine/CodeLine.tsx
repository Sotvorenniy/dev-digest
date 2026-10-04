/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s, fs, lineRowFor, lineSignFor } from "../styles";
import { FINDING_LINE_LABEL_KEY } from "../constants";
import { worstSeverity, type DiffFindingApi } from "../findings";
import { InlineFinding } from "../InlineFinding";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
  lineFindings,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  /** Findings anchored to this row (RIGHT side / new line). */
  lineFindings?: FindingRecord[];
}) {
  const ts = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const flagged = findings && lineFindings && lineFindings.length > 0 ? lineFindings : [];
  const worst = worstSeverity(flagged);
  const labelKey = worst ? FINDING_LINE_LABEL_KEY[worst] : undefined;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...lineRowFor(ln.kind), position: "relative" }}>
        {worst && <span data-finding-line={worst} style={fs.bar(worst)} />}
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {worst && labelKey && (
          <span data-finding-line-label={labelKey} style={fs.label(worst)}>
            <Icon.AlertTriangle size={11} />
            {ts(`diffViewer.findingLabel.${labelKey}`)}
          </span>
        )}
      </div>

      {findings &&
        flagged.map((f) => (
          <div key={f.id} style={fs.inlineWrap}>
            <InlineFinding
              finding={f}
              pending={findings.pendingId === f.id}
              onAction={(action) => findings.onAction(f, action)}
            />
          </div>
        ))}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
