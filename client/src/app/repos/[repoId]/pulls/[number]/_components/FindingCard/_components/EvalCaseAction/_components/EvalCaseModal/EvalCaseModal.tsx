"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Textarea, TextInput } from "@devdigest/ui";
import type { EvalCaseDraft } from "@devdigest/shared";
import { useCreateEvalCase, useRunEvalCaseDraft } from "@/lib/hooks";
import { parseExpected, toFields } from "./helpers";
import { s } from "./styles";

/** Warm-up step for a new eval case: the finding fills the fields, the user can run the case
 *  and edit it, and only Save writes it. All values render as text — finding content is
 *  never interpreted as markup. */
export function EvalCaseModal({
  draft,
  findingId,
  onClose,
  onSaved,
}: {
  draft: EvalCaseDraft;
  findingId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("eval.caseEditor");
  const run = useRunEvalCaseDraft(draft.agent_id);
  const save = useCreateEvalCase();

  const [name, setName] = React.useState(draft.name);
  const [diff, setDiff] = React.useState(draft.input_diff);
  const [expectedText, setExpectedText] = React.useState(() =>
    JSON.stringify(draft.expected_output, null, 2),
  );

  const expected = parseExpected(expectedText);
  const ready = !!expected && name.trim() !== "" && diff.trim() !== "";
  const current = () => toFields(draft, { name, diff, expected: expected! });
  const result = run.data;

  // An edit makes the shown result stale; clear it so it never looks like it applies to the new text.
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    run.reset();
  };
  // Closing mid-save would drop the per-call onSaved callback while the case is still written.
  const close = () => {
    if (!save.isPending) onClose();
  };

  const doRun = () => {
    if (ready) run.mutate(current());
  };
  const doSave = () => {
    if (!ready) return;
    save.mutate(
      { findingId, agentId: draft.agent_id, fields: current() },
      { onSuccess: onSaved },
    );
  };

  const statusLabel =
    result?.status === "pass" ? t("runPassed") : result?.status === "fail" ? t("runFailed") : t("runErrored");

  return (
    <Modal
      width={760}
      title={t("modalTitle")}
      subtitle={t("modalSubtitle")}
      onClose={close}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" size="sm" disabled={save.isPending} onClick={close}>
            {t("cancel")}
          </Button>
          <Button kind="secondary" size="sm" disabled={!ready || run.isPending} onClick={doRun}>
            {run.isPending ? t("running") : t("runCase")}
          </Button>
          <Button kind="primary" size="sm" disabled={!ready || save.isPending} onClick={doSave}>
            {save.isPending ? t("saving") : t("save")}
          </Button>
        </div>
      }
    >
      <div data-eval-case-modal style={s.body}>
        <label style={s.label}>
          {t("nameLabel")}
          <TextInput value={name} onChange={edit(setName)} placeholder={t("namePlaceholder")} />
        </label>
        <label style={s.label}>
          {t("diffLabel")}
          <Textarea mono rows={10} value={diff} onChange={edit(setDiff)} placeholder={t("diffPlaceholder")} />
        </label>
        <label style={s.label}>
          {t("expectedOutput")}
          <Textarea mono rows={9} value={expectedText} onChange={edit(setExpectedText)} />
        </label>
        <span style={s.hint}>{t("expectedHint")}</span>
        <span style={{ ...s.jsonState, ...(expected ? s.jsonOk : s.jsonBad) }}>
          {expected ? t("validJson") : t("invalidExpected")}
        </span>

        <div aria-live="polite" data-eval-case-result style={s.result}>
          {run.isError ? (
            <span style={s.error}>{t("runRequestFailed")}</span>
          ) : !result ? (
            <span style={s.hint}>{t("notRun")}</span>
          ) : (
            <>
              <strong>{statusLabel}</strong>
              {result.error ? (
                <span style={s.error}>{result.error}</span>
              ) : (
                <>
                  <span>
                    {t("runSummary", {
                      matched: result.matched_items,
                      expected: expected?.items.length ?? 0,
                      kept: result.kept.length,
                    })}
                  </span>
                  <span style={s.label}>{t("reported")}</span>
                  {result.kept.length === 0 ? (
                    <span style={s.hint}>{t("reportedNone")}</span>
                  ) : (
                    <ul style={s.resultList}>
                      {result.kept.map((f, i) => (
                        <li key={i}>{`${f.file}:${f.start_line} ${f.title}`}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </div>
        {save.isError && <span style={s.error}>{t("saveFailed")}</span>}
      </div>
    </Modal>
  );
}
