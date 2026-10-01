"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/** Preview tab — the saved body rendered exactly as the reviewing agent's
 *  prompt assembly receives it (draft edits stay on the Config tab). */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.hint}>{t("preview.hint")}</div>
      <div style={s.card}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
