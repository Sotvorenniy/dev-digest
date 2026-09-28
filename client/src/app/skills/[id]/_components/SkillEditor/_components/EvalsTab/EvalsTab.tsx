"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/** Evals tab — not built yet this pass; a plain "coming soon" mount point. */
// `skill` is unused — kept so every tab under SkillEditor has the same signature.
export function EvalsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <EmptyState icon="FlaskConical" title={t("editor.tabs.evals")} body={t("evals.comingSoon")} />
    </div>
  );
}
