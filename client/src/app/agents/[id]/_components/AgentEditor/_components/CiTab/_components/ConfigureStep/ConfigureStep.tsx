"use client";

import { useTranslations } from "next-intl";
import { CI_POST_AS, CI_TRIGGERS, type CiPostAs } from "../../constants";
import { s } from "../../styles";

/** Step 3 — triggers and where results are posted. Presentational. */
export function ConfigureStep({
  triggers,
  onToggleTrigger,
  postAs,
  onPostAs,
}: {
  triggers: string[];
  onToggleTrigger: (v: string) => void;
  postAs: CiPostAs;
  onPostAs: (v: CiPostAs) => void;
}) {
  const t = useTranslations("ci");
  return (
    <>
      <div style={s.group}>
        <span id="ci-triggers-label" style={s.label}>{t("wizard.configure.triggersLabel")}</span>
        <div style={s.chips} role="group" aria-labelledby="ci-triggers-label">
          {CI_TRIGGERS.map((tr) => {
            const on = triggers.includes(tr.value);
            return (
              <button
                key={tr.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                style={{ ...s.chip, ...(on ? s.chipOn : null) }}
                onClick={() => onToggleTrigger(tr.value)}
                data-ci-trigger={tr.value}
              >
                {t(tr.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
      <div style={s.group}>
        <span id="ci-postas-label" style={s.label}>{t("wizard.configure.postAsLabel")}</span>
        <div style={s.chips} role="radiogroup" aria-labelledby="ci-postas-label">
          {CI_POST_AS.map((p) => {
            const on = p.value === postAs;
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={on}
                style={{ ...s.chip, ...(on ? s.chipOn : null) }}
                onClick={() => onPostAs(p.value)}
                data-ci-post-as={p.value}
              >
                {t(p.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
