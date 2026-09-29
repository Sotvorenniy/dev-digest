"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, IconBtn, ProgressBar, TextInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { useEditConventionCandidate, useSetConventionCandidateStatus } from "@/lib/hooks/conventions";
import { COPIED_RESET_MS, confidenceColor } from "./constants";
import { formatEvidenceLocation } from "./helpers";
import { s } from "./styles";

/** One scanned convention candidate — rule, evidence snippet, confidence bar,
 *  Accept/Reject, and an inline pencil-Edit that swaps the rule + snippet into
 *  editable fields without leaving the card (no route change). */
export function ConventionCandidateCard({
  repoId,
  candidate,
}: {
  repoId: string;
  candidate: ConventionCandidate;
}) {
  const t = useTranslations("conventions");
  const setStatus = useSetConventionCandidateStatus(repoId);
  const edit = useEditConventionCandidate(repoId);

  const [isEditing, setIsEditing] = React.useState(false);
  const [ruleDraft, setRuleDraft] = React.useState(candidate.rule);
  const [snippetDraft, setSnippetDraft] = React.useState(candidate.evidence_snippet);
  const [copied, setCopied] = React.useState(false);

  const startEdit = () => {
    setRuleDraft(candidate.rule);
    setSnippetDraft(candidate.evidence_snippet);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setRuleDraft(candidate.rule);
    setSnippetDraft(candidate.evidence_snippet);
    setIsEditing(false);
  };

  const saveEdit = () => {
    edit.mutate(
      { id: candidate.id, rule: ruleDraft.trim(), evidence_snippet: snippetDraft },
      { onSuccess: () => setIsEditing(false) },
    );
  };

  const copySnippet = () => {
    void navigator.clipboard?.writeText(candidate.evidence_snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  const toggleAccepted = () =>
    setStatus.mutate({ id: candidate.id, status: candidate.status === "accepted" ? "pending" : "accepted" });
  const reject = () => setStatus.mutate({ id: candidate.id, status: "rejected" });

  const pct = Math.round(candidate.confidence * 100);

  return (
    <div style={s.card} data-convention-candidate-id={candidate.id} data-convention-status={candidate.status}>
      <div style={s.headerRow}>
        {isEditing ? (
          <div style={s.ruleField}>
            <FormField label={t("card.editingRule")}>
              <TextInput value={ruleDraft} onChange={setRuleDraft} />
            </FormField>
          </div>
        ) : (
          <div style={s.rule}>{candidate.rule}</div>
        )}
        <div style={s.actions}>
          <IconBtn icon="Edit" label={t("card.edit")} active={isEditing} onClick={startEdit} />
        </div>
      </div>

      {isEditing ? (
        <FormField label={t("card.editingSnippet")}>
          <Textarea value={snippetDraft} onChange={setSnippetDraft} rows={4} mono />
        </FormField>
      ) : (
        <div style={s.snippetBox}>
          <div style={s.snippetHeader}>
            <span className="mono" style={s.snippetPath}>
              {formatEvidenceLocation(candidate)}
            </span>
            <IconBtn
              icon={copied ? "Check" : "Copy"}
              label={copied ? t("card.copied") : t("card.copySnippet")}
              onClick={copySnippet}
            />
          </div>
          <pre style={s.snippetPre}>{candidate.evidence_snippet}</pre>
        </div>
      )}

      {isEditing ? (
        <div style={s.editActions}>
          <Button kind="ghost" onClick={cancelEdit}>
            {t("card.cancelEdit")}
          </Button>
          <Button kind="primary" icon="Check" onClick={saveEdit} disabled={edit.isPending}>
            {t("card.saveEdit")}
          </Button>
        </div>
      ) : (
        <>
          <div style={s.confidenceRow}>
            <span style={s.confidenceLabel}>{t("card.confidence")}</span>
            <div style={s.confidenceBar}>
              <ProgressBar value={pct} color={confidenceColor(candidate.confidence)} />
            </div>
            <span className="mono tnum" style={s.confidencePct}>
              {pct}%
            </span>
          </div>
          <div style={s.footerActions}>
            <Button
              kind={candidate.status === "accepted" ? "primary" : "secondary"}
              icon="Check"
              onClick={toggleAccepted}
              disabled={setStatus.isPending}
            >
              {setStatus.isPending && setStatus.variables?.status === "accepted"
                ? t("card.accepting")
                : candidate.status === "accepted"
                  ? t("card.accepted")
                  : t("card.acceptAsSkill")}
            </Button>
            <Button kind="ghost" icon="X" onClick={reject} disabled={setStatus.isPending}>
              {t("card.reject")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
