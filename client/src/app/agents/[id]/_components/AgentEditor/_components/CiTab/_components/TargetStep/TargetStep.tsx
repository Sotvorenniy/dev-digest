"use client";

import { useTranslations } from "next-intl";
import { SelectInput } from "@devdigest/ui";
import type { CiTarget } from "@devdigest/shared";
import { CI_TARGETS } from "../../constants";
import { s } from "../../styles";

/** Step 1 — pick the target and an imported repo. Presentational. */
export function TargetStep({
  repos,
  repo,
  onRepo,
  target,
  errorKey,
  errorValues,
}: {
  repos: string[];
  repo: string;
  onRepo: (v: string) => void;
  target: CiTarget;
  errorKey: string | null;
  errorValues?: Record<string, string>;
}) {
  const t = useTranslations("ci");
  return (
    <>
      <div style={s.cards} data-ci-targets>
        {CI_TARGETS.map((tg) => {
          const selected = tg.value === target;
          return (
            <button
              key={tg.value}
              type="button"
              aria-disabled={tg.enabled ? undefined : "true"}
              aria-pressed={tg.enabled ? selected : undefined}
              onClick={tg.enabled ? undefined : () => {}}
              style={{ ...s.card, ...(selected ? s.cardSelected : null), ...(tg.enabled ? null : s.cardDisabled) }}
              data-ci-target={tg.value}
            >
              <span>{t(tg.labelKey)}</span>
              {!tg.enabled && <span style={s.hint}>{t("wizard.target.comingSoon")}</span>}
            </button>
          );
        })}
      </div>
      <div style={s.group}>
        <span style={s.label}>{t("wizard.target.repoLabel")}</span>
        <SelectInput
          value={repo}
          onChange={onRepo}
          options={[{ value: "", label: t("wizard.target.repoPlaceholder") }, ...repos.map((r) => ({ value: r, label: r }))]}
        />
      </div>
      {errorKey && (
        <div role="alert" style={s.alert} data-ci-target-error>
          {t(errorKey, errorValues)}
        </div>
      )}
    </>
  );
}
