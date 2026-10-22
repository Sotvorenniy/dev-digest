"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { EvalSetRun } from "@devdigest/shared";
import { formatCost, formatSignedCost } from "@/components/run-cost-badge";
import { useEvalRun, useUpdateAgent } from "@/lib/hooks";
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
  const update = useUpdateAgent();
  const [confirming, setConfirming] = React.useState(false);
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

  // Promote copies the newer run's prompt onto the agent; the update saves it as a new agent version.
  const promotable = !!oldDetail && !!newDetail && oldDetail.system_prompt !== newDetail.system_prompt;
  const promote = () =>
    update.mutate({ id: newRun.agent_id, patch: { system_prompt: newDetail!.system_prompt } });
  const version = `v${newRun.agent_version}`;

  // The footer swaps its buttons; move focus to the one the user acts on next so a keyboard
  // user is not dropped on <body> when the focused button unmounts.
  const wasConfirming = React.useRef(false);
  React.useEffect(() => {
    const focus = (name: string) =>
      rootRef.current?.querySelector<HTMLElement>(`[data-compare-action="${name}"]`)?.focus();
    if (update.isSuccess) focus("close");
    else if (confirming) focus("confirm");
    else if (wasConfirming.current) focus("promote");
    wasConfirming.current = confirming;
  }, [confirming, update.isSuccess]);

  const startConfirm = () => {
    update.reset();
    setConfirming(true);
  };
  const cancelConfirm = () => {
    update.reset();
    setConfirming(false);
  };

  let footer: React.ReactNode;
  if (update.isSuccess) {
    footer = (
      <div style={s.compareFooter}>
        <span role="status" style={s.notice}>{t("compare.promoteDone")}</span>
        <Button data-compare-action="close" kind="ghost" size="sm" onClick={onClose}>{t("compare.close")}</Button>
      </div>
    );
  } else if (confirming) {
    footer = (
      <div style={s.compareFooter}>
        {update.isError && (
          <span role="alert" style={s.notice}>
            {t("compare.promoteFailed")}
          </span>
        )}
        <span id="compare-promote-prompt" style={s.notice}>
          {t("compare.promoteConfirm", { version })}
        </span>
        <Button kind="ghost" size="sm" disabled={update.isPending} onClick={cancelConfirm}>
          {t("compare.promoteCancel")}
        </Button>
        <Button
          data-compare-action="confirm"
          aria-describedby="compare-promote-prompt"
          kind="primary"
          size="sm"
          disabled={update.isPending}
          onClick={promote}
        >
          {update.isPending ? t("compare.promoting") : t("compare.promoteConfirmButton")}
        </Button>
      </div>
    );
  } else {
    footer = (
      <div style={s.compareFooter}>
        <Button kind="ghost" size="sm" onClick={onClose}>{t("compare.close")}</Button>
        {promotable && (
          <Button data-compare-action="promote" kind="primary" size="sm" icon="GitBranch" onClick={startConfirm}>
            {t("compare.promote", { version })}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} data-compare-dialog>
      <Modal width={640} title={title} onClose={onClose} footer={footer}>
        <div style={s.dialogBody}>{body}</div>
      </Modal>
    </div>
  );
}
