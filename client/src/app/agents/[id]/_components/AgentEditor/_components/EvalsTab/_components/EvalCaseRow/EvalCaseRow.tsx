"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { useRunEvalCaseDraft } from "@/lib/hooks";
import { s } from "../../styles";

/** One eval case: name, expectation type, last status, and Run / Edit / Delete.
 *  Run checks this one case with the agent's current prompt and shows the outcome inline;
 *  it stores nothing. The case name is user/PR-derived, so it renders as text with a full-name title. */
export function EvalCaseRow({
  evalCase,
  agentId,
  onEdit,
  onDelete,
}: {
  evalCase: EvalCase;
  agentId: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval");
  const run = useRunEvalCaseDraft(agentId);
  const outcome = run.data?.status;

  // A saved edit makes the shown run result stale; clear it so it never describes the old text.
  const { reset } = run;
  React.useEffect(() => {
    reset();
  }, [reset, evalCase.name, evalCase.input_diff, evalCase.input_meta, evalCase.expected_output]);

  const doRun = () => {
    if (run.isPending) return;
    run.mutate({
      name: evalCase.name,
      input_diff: evalCase.input_diff,
      input_files: evalCase.input_files,
      input_meta: evalCase.input_meta,
      expected_output: evalCase.expected_output,
    });
  };

  return (
    <li data-eval-case-row={evalCase.id} style={s.caseRow}>
      <span style={s.caseName} title={evalCase.name}>
        {evalCase.name}
      </span>
      <span style={s.caseMeta}>{t(`evalsTab.type.${evalCase.expected_output.type}`)}</span>
      <span data-eval-status={evalCase.last_status} style={s.caseStatus}>
        {t(`evalsTab.status.${evalCase.last_status}`)}
      </span>
      {evalCase.decision_changed && <span style={s.badge}>{t("evalsTab.decisionChanged")}</span>}
      <span aria-live="polite" data-eval-row-run style={s.caseRunNote}>
        {run.isPending && t("evalsTab.running")}
        {run.isError && t("evalsTab.runCaseFailed")}
        {outcome && t(`evalsTab.rowRun.${outcome}`)}
      </span>
      <IconBtn
        icon="Play"
        label={t("evalsTab.runCase", { name: evalCase.name })}
        onClick={doRun}
      />
      <IconBtn icon="Edit" label={t("evalsTab.editCase", { name: evalCase.name })} onClick={onEdit} />
      <IconBtn icon="Trash" danger label={t("evalsTab.deleteCase", { name: evalCase.name })} onClick={onDelete} />
    </li>
  );
}
