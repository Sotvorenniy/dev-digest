"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingRunCommand } from "@devdigest/shared";
import { COPIED_RESET_MS } from "../../constants";
import { s } from "../../styles";

/** Commands with per-command copy buttons. Owns which command was just copied. */
export function RunLocallySection({ commands }: { commands: OnboardingRunCommand[] }) {
  const t = useTranslations("onboarding");
  const [copied, setCopied] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return;
    }
    setCopied(command);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPIED_RESET_MS);
  };

  return (
    <div>
      <div style={s.warning}>{t("run.reviewBeforeRunning")}</div>
      {commands.length === 0 ? (
        <p style={s.empty}>{t("run.empty")}</p>
      ) : (
        <ul style={s.list}>
          {commands.map((c) => {
            const isCopied = copied === c.command;
            return (
              <li key={`${c.source}:${c.command}`} style={s.entry} data-onboarding-command>
                <div style={s.entryMain}>
                  <pre style={s.command}>{c.command}</pre>
                  {c.note && <div style={s.entryNote}>{c.note}</div>}
                </div>
                <Button
                  kind="ghost"
                  size="sm"
                  icon={isCopied ? "Check" : "Copy"}
                  aria-label={t(isCopied ? "run.copied" : "run.copy", { command: c.command })}
                  onClick={() => copy(c.command)}
                  data-onboarding-copy
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
