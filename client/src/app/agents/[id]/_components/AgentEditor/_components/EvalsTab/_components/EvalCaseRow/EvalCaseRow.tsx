"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { s } from "../../styles";

/** One eval case: name, expectation type, last status and a delete button.
 *  The case name is user/PR-derived, so it renders as text with a full-name title. */
export function EvalCaseRow({ evalCase, onDelete }: { evalCase: EvalCase; onDelete: () => void }) {
  const t = useTranslations("eval");
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
      <IconBtn icon="Trash" danger label={t("evalsTab.deleteCase", { name: evalCase.name })} onClick={onDelete} />
    </li>
  );
}
