"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, SelectInput } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useAgents, useEvalCaseDraft } from "@/lib/hooks";
import { s } from "../../styles";
import { EvalCaseModal } from "./_components/EvalCaseModal";

/** "Turn into eval case" on a decided finding. Opens EvalCaseModal with a prefilled draft;
 *  nothing is saved until the user presses Save there. Uses the review's own agent; when the
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
  const draft = useEvalCaseDraft();
  const [picking, setPicking] = React.useState(false);
  const [chosen, setChosen] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);

  const decided = !!finding.accepted_at || !!finding.dismissed_at;
  const reasonId = `eval-reason-${finding.id}`;
  const agentList = agents.data ?? [];
  const hasOwnAgent = !!reviewAgentId && agentList.some((a) => a.id === reviewAgentId);
  const selected = chosen || agentList[0]?.id || "";
  const diffGone = draft.error instanceof ApiError && draft.error.code === "diff_unavailable";

  const openDraft = (agentId?: string) =>
    draft.mutate({ findingId: finding.id, agentId }, { onSuccess: () => setModalOpen(true) });

  const activate = () => {
    if (hasOwnAgent) openDraft();
    else setPicking(true);
  };

  const confirmPick = () => {
    if (!selected) return;
    openDraft(selected);
    setPicking(false);
  };

  return (
    <div data-eval-case-action={finding.id} style={s.evalAction}>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!decided || draft.isPending || saved}
        aria-describedby={decided ? undefined : reasonId}
        onClick={activate}
      >
        {draft.isPending ? t("findingAction.creating") : t("findingAction.turnInto")}
      </Button>
      {!decided && (
        <span id={reasonId} style={s.evalNote}>
          {t("findingAction.undecidedReason")}
        </span>
      )}
      <span aria-live="polite" style={s.evalNote}>
        {saved && <span style={s.evalCreated}>{t("findingAction.created")}</span>}
        {diffGone && <span style={s.evalError}>{t("findingAction.diffUnavailable")}</span>}
        {draft.isError && !diffGone && <span style={s.evalError}>{t("findingAction.createFailed")}</span>}
      </span>

      {modalOpen && draft.data && (
        <EvalCaseModal
          draft={draft.data}
          findingId={finding.id}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            setSaved(true);
          }}
        />
      )}

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
