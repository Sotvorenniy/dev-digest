"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { RUNNER_BUNDLE_PATH } from "../../constants";
import { formatBytes } from "../../helpers";
import { s } from "../../styles";

/** Step 2 — the generated files, each with a Copy button. Presentational. */
export function PreviewStep({ files }: { files: CiFile[] }) {
  const t = useTranslations("ci");
  const [copied, setCopied] = React.useState<string | null>(null);

  const copy = async (file: CiFile) => {
    try {
      await navigator.clipboard.writeText(file.contents);
      setCopied(file.path);
    } catch {
      setCopied(null);
    }
  };

  return (
    <>
      <div style={s.warning} data-ci-public-warning>{t("wizard.preview.publicWarning")}</div>
      {files.map((f) => (
        <div key={f.path} style={s.file} data-ci-file={f.path}>
          <div style={s.fileHead}>
            <span style={s.filePath}>{f.path}</span>
            {f.path !== RUNNER_BUNDLE_PATH && (
              <Button size="sm" kind="secondary" icon="Copy" onClick={() => copy(f)} data-ci-copy>
                {t("wizard.preview.copy")}
              </Button>
            )}
          </div>
          {f.path === RUNNER_BUNDLE_PATH ? (
            <span style={s.hint}>{t("wizard.preview.bundleSize", { size: formatBytes(f.contents.length) })}</span>
          ) : (
            <pre style={s.pre}>{f.contents}</pre>
          )}
          <span role="status" aria-live="polite" style={s.hint}>
            {copied === f.path ? t("wizard.preview.copied") : ""}
          </span>
        </div>
      ))}
    </>
  );
}
