"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, SelectInput } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useAgents, useCreateEvalCase } from "@/lib/hooks";
import { s } from "../../styles";

/** "Turn into eval case" on a decided finding. Uses the review's own agent; when the
 *  review has none (or it was deleted) a picker asks which agent owns the case.
 *  All text is rendered as text — finding content never reaches this component. */
export function EvalCaseAction({
  finding,
  reviewAgentId,
}: {
  finding: FindingRecord;
  reviewAgentId?: string | null;
}) {
  const t = useTranslations("eval");
  const agents = useAgents();
  const create = useCreateEvalCase();
  const [picking, setPicking] = React.useState(false);
  const [chosen, setChosen] = React.useState("");

  const decided = !!finding.accepted_at || !!finding.dismissed_at;
  const reasonId = `eval-reason-${finding.id}`;
  const agentList = agents.data ?? [];
  const hasOwnAgent = !!reviewAgentId && agentList.some((a) => a.id === reviewAgentId);
  const selected = chosen || agentList[0]?.id || "";
  const diffGone = create.error instanceof ApiError && create.error.code === "diff_unavailable";

  const activate = () => {
    if (hasOwnAgent) create.mutate({ findingId: finding.id });
    else setPicking(true);
  };

  const confirmPick = () => {
    if (!selected) return;
    create.mutate({ findingId: finding.id, agentId: selected });
    setPicking(false);
  };

  return (
    <div data-eval-case-action={finding.id} style={s.evalAction}>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!decided || create.isPending || create.isSuccess}
        aria-describedby={decided ? undefined : reasonId}
        onClick={activate}
      >
        {create.isPending ? t("findingAction.creating") : t("findingAction.turnInto")}
      </Button>
      {!decided && (
        <span id={reasonId} style={s.evalNote}>
          {t("findingAction.undecidedReason")}
        </span>
      )}
      <span aria-live="polite" style={s.evalNote}>
        {create.isSuccess && <span style={s.evalCreated}>{t("findingAction.created")}</span>}
        {diffGone && <span style={s.evalError}>{t("findingAction.diffUnavailable")}</span>}
        {create.isError && !diffGone && <span style={s.evalError}>{t("findingAction.createFailed")}</span>}
      </span>

      {picking && (
        <Modal width={420} title={t("findingAction.pickAgentTitle")} onClose={() => setPicking(false)}>
          <div data-agent-picker style={s.picker}>
            {agents.isLoading ? (
              <span style={s.evalNote}>{t("findingAction.agentsLoading")}</span>
            ) : agents.isError ? (
              <span style={s.evalError}>{t("findingAction.agentsError")}</span>
            ) : agentList.length === 0 ? (
              <span style={s.evalNote}>{t("findingAction.noAgents")}</span>
            ) : (
              <>
                <span style={s.pickerLabel}>{t("findingAction.pickAgentLabel")}</span>
                <SelectInput
                  mono={false}
                  value={selected}
                  onChange={setChosen}
                  options={agentList.map((a) => ({ value: a.id, label: a.name }))}
                />
                <div style={s.pickerFooter}>
                  <Button kind="primary" size="sm" onClick={confirmPick}>
                    {t("findingAction.pickAgentConfirm")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
