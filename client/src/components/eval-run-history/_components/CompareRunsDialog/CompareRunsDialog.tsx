"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { EvalSetRun } from "@devdigest/shared";
import { formatCost, formatSignedCost } from "@/components/run-cost-badge";
import { useEvalRun } from "@/lib/hooks";
import { deltaPoints, formatDeltaPoints, formatPct, orderOldNew } from "@/lib/eval-metrics";
import { promptLineDiff } from "../../helpers";
import { useFocusTrap } from "../../hooks";
import { s } from "../../styles";

type RateKey = "recall" | "precision" | "citation_accuracy";

/** Old → new compare of two finished runs: metrics, cost, model and prompt line diff.
 *  Prompt lines are rendered as text, never HTML. */
export function CompareRunsDialog({
  runs,
  onClose,
}: {
  runs: [EvalSetRun, EvalSetRun];
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const rootRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(rootRef, onClose);

  const [oldRun, newRun] = orderOldNew(runs[0], runs[1]);
  const oldQ = useEvalRun(oldRun.id);
  const newQ = useEvalRun(newRun.id);
  const title = t("compare.title", { old: `v${oldRun.agent_version}`, new: `v${newRun.agent_version}` });

  const rates: Array<{ key: RateKey; label: string }> = [
    { key: "recall", label: t("compare.recall") },
    { key: "precision", label: t("compare.precision") },
    { key: "citation_accuracy", label: t("compare.citation") },
  ];

  const oldDetail = oldQ.data;
  const newDetail = newQ.data;
  let body: React.ReactNode;
  if (oldQ.isError || newQ.isError) {
    body = <ErrorState title={t("compare.loadError")} />;
  } else if (!oldDetail || !newDetail) {
    body = <Skeleton height={160} />;
  } else {
    const lines = promptLineDiff(oldDetail.system_prompt, newDetail.system_prompt);
    const costDelta =
      oldRun.cost_usd != null && newRun.cost_usd != null ? formatSignedCost(newRun.cost_usd - oldRun.cost_usd) : null;
    body = (
      <>
        {oldRun.model !== newRun.model && (
          <div data-models-differ style={s.notice}>
            {t("compare.modelsDiffer", { old: oldRun.model, new: newRun.model })}
          </div>
        )}
        <div style={s.compareGrid}>
          <span />
          <span style={s.compareHead}>{t("compare.old")}</span>
          <span style={s.compareHead}>{t("compare.new")}</span>
          {rates.map(({ key, label }) => (
            <React.Fragment key={key}>
              <span style={s.compareLabel}>{label}</span>
              <span style={s.compareValue}>{formatPct(oldRun[key])}</span>
              <span style={s.compareValue}>
                {formatPct(newRun[key])} ({formatDeltaPoints(deltaPoints(newRun[key], oldRun[key]))})
              </span>
            </React.Fragment>
          ))}
          <span style={s.compareLabel}>{t("compare.cost")}</span>
          <span style={s.compareValue}>{formatCost(oldRun.cost_usd)}</span>
          <span style={s.compareValue}>
            {formatCost(newRun.cost_usd)}
            {costDelta ? ` (${costDelta})` : ""}
          </span>
        </div>
        <div>
          <div style={s.sectionLabel}>{t("compare.promptDiff")}</div>
          {lines.length === 0 ? (
            <div style={s.empty}>{t("compare.promptsIdentical")}</div>
          ) : (
            <pre style={s.promptDiff}>
              {lines.map((l, i) => (
                <div key={i} data-prompt-line={l.kind} title={l.text} style={s.promptLine(l.kind)}>
                  {l.kind === "added" ? "+ " : "− "}
                  {l.text}
                </div>
              ))}
            </pre>
          )}
        </div>
      </>
    );
  }

  return (
    <div ref={rootRef} data-compare-dialog>
      <Modal width={640} title={title} onClose={onClose}>
        <div style={s.dialogBody}>{body}</div>
      </Modal>
    </div>
  );
}
