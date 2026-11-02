"use client";

import { useTranslations } from "next-intl";
import { isGithubPrUrl } from "../../helpers";
import { s } from "../../styles";

/** Step 4 — the install card, secret hint, and the PR link or inline error. Presentational. */
export function InstallStep({
  repo,
  prUrl,
  errorKey,
}: {
  repo: string;
  prUrl: string | null;
  errorKey: string | null;
}) {
  const t = useTranslations("ci");
  return (
    <>
      <div style={s.card} data-ci-install-card>
        <span>{t("wizard.install.cardTitle")}</span>
        <span style={s.hint}>{t("wizard.install.cardBody", { repo })}</span>
      </div>
      <div style={s.hint} data-ci-secret-hint>{t("wizard.install.secretHint")}</div>
      <div role="status" aria-live="polite">
        {isGithubPrUrl(prUrl) && (
          <a href={prUrl} target="_blank" rel="noopener noreferrer" style={s.link} data-ci-pr-link>
            {t("wizard.install.prLink")}
          </a>
        )}
      </div>
      {errorKey && (
        <div role="alert" style={s.alert} data-ci-install-error>
          {t(errorKey)}
        </div>
      )}
    </>
  );
}
