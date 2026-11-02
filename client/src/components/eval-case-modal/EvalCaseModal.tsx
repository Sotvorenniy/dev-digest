"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal, Textarea, TextInput } from "@devdigest/ui";
import type { EvalCaseFields } from "@devdigest/shared";
import { useRunEvalCaseDraft } from "@/lib/hooks";
import { hunkFromTexts, parseExpected, toFields, withSkeleton } from "./helpers";
import { s } from "./styles";

/** Warm-up and edit step for an eval case: the caller supplies the starting fields, the user can
 *  run the case and edit it, and only Save hands the fields back. All values render as text —
 *  finding and PR content is never interpreted as markup. Portalled to <body> so a parent's
 *  stacking context cannot trap the fixed overlay. */
export function EvalCaseModal({
  mode = "create",
  agentId,
  initial,
  saving,
  saveFailed,
  onSave,
  onClose,
}: {
  /** create: from a finding; edit: a saved case; new: written by hand. */
  mode?: "create" | "edit" | "new";
  agentId: string;
  initial: EvalCaseFields;
  saving: boolean;
  saveFailed: boolean;
  /** Called with the edited fields; the caller closes the modal when the save succeeds. */
  onSave: (fields: EvalCaseFields) => void;
  onClose: () => void;
}) {
  const t = useTranslations("eval.caseEditor");
  const run = useRunEvalCaseDraft(agentId);

  const [name, setName] = React.useState(initial.name);
  const [diff, setDiff] = React.useState(initial.input_diff);
  // A hand-written case is typed as before / after text; the diff is generated from them.
  const [before, setBefore] = React.useState("");
  const [after, setAfter] = React.useState("");
  const [filePath, setFilePath] = React.useState(initial.input_files[0] ?? "");
  const [expectedText, setExpectedText] = React.useState(() =>
    JSON.stringify(initial.expected_output, null, 2),
  );

  const expected = parseExpected(expectedText);
  // The diff walk is not free on large pastes: recompute only when its inputs change, not per keystroke elsewhere.
  const effectiveDiff = React.useMemo(
    () => (mode === "new" ? hunkFromTexts(before, after) : diff),
    [mode, before, after, diff],
  );
  // A must_find case with nothing to find would pass whatever the agent does and sit outside recall.
  const emptyMustFind = expected?.type === "must_find" && expected.items.length === 0;
  const ready =
    !!expected && !emptyMustFind && name.trim() !== "" && effectiveDiff.trim() !== "" && (mode !== "new" || filePath.trim() !== "");
  const current = () =>
    toFields(initial, {
      name,
      diff: effectiveDiff,
      expected: expected!,
      filePath: mode === "new" ? filePath : undefined,
    });
  const result = run.data;

  // An edit makes the shown result stale; clear it so it never looks like it applies to the new text.
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    run.reset();
  };
  // Closing mid-save would drop the caller's success handling while the case is still written.
  const close = () => {
    if (!saving) onClose();
  };

  const addSkeleton = () => {
    const next = withSkeleton(expectedText);
    if (next) edit(setExpectedText)(next);
  };

  const doRun = () => {
    if (ready) run.mutate(current());
  };
  const doSave = () => {
    if (ready) onSave(current());
  };

  const statusLabel =
    result?.status === "pass" ? t("runPassed") : result?.status === "fail" ? t("runFailed") : t("runErrored");

  return createPortal(
    <Modal
      width={760}
      title={mode === "edit" ? t("editTitle") : mode === "new" ? t("newCase") : t("modalTitle")}
      subtitle={mode === "edit" ? t("editSubtitle") : mode === "new" ? t("newSubtitle") : t("modalSubtitle")}
      onClose={close}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" size="sm" disabled={saving} onClick={close}>
            {t("cancel")}
          </Button>
          <Button kind="secondary" size="sm" disabled={!ready || run.isPending} onClick={doRun}>
            {run.isPending ? t("running") : t("runCase")}
          </Button>
          <Button kind="primary" size="sm" disabled={!ready || saving} onClick={doSave}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      }
    >
      <div data-eval-case-modal style={s.body}>
        {expected?.type === "must_not_flag" && (
          <div data-negative-case role="status" style={s.negative}>
            <strong>{t("negativeTitle")}</strong>
            <span>{t("negativeBody")}</span>
          </div>
        )}
        <label style={s.label}>
          {t("nameLabel")}
          <TextInput value={name} onChange={edit(setName)} placeholder={t("namePlaceholder")} />
        </label>
        {mode === "new" && (
          <label style={s.label}>
            {t("filePathLabel")}
            <TextInput mono value={filePath} onChange={edit(setFilePath)} placeholder={t("filePathPlaceholder")} />
          </label>
        )}
        {mode === "new" ? (
          <>
            <label style={s.label}>
              {t("beforeLabel")}
              <Textarea mono rows={6} value={before} onChange={edit(setBefore)} placeholder={t("beforePlaceholder")} />
            </label>
            <label style={s.label}>
              {t("afterLabel")}
              <Textarea mono rows={6} value={after} onChange={edit(setAfter)} placeholder={t("afterPlaceholder")} />
            </label>
            <details style={s.hint}>
              <summary>{t("previewDiff")}</summary>
              <pre data-generated-diff tabIndex={0} aria-label={t("previewDiff")} style={s.preview}>
                {effectiveDiff || t("noChange")}
              </pre>
            </details>
          </>
        ) : (
          <label style={s.label}>
            {t("diffLabel")}
            <Textarea mono rows={10} value={diff} onChange={edit(setDiff)} placeholder={t("diffPlaceholder")} />
          </label>
        )}
        <label style={s.label}>
          {t("expectedOutput")}
          <Textarea mono rows={9} value={expectedText} onChange={edit(setExpectedText)} />
        </label>
        <div>
          <Button kind="ghost" size="sm" icon="Plus" disabled={!expected} onClick={addSkeleton}>
            {t("skeleton")}
          </Button>
        </div>
        <span style={s.hint}>{t("expectedHint")}</span>
        <span aria-live="polite" style={{ ...s.jsonState, ...(expected && !emptyMustFind ? s.jsonOk : s.jsonBad) }}>
          {!expected ? t("invalidExpected") : emptyMustFind ? t("emptyMustFind") : t("validJson")}
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
        {saveFailed && <span style={s.error}>{t("saveFailed")}</span>}
      </div>
    </Modal>,
    document.body,
  );
}
