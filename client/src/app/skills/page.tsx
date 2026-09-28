/* /skills — Skills Lab index: rail + right pane. Nothing selected yet, so the
   right pane just prompts a pick (same shell as /skills/:id). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "../../components/app-shell";
import { SkillsRail } from "./_components/SkillsRail";

export default function SkillsPage() {
  const t = useTranslations("skills");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }];

  return (
    <AppShell crumb={crumb}>
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        <SkillsRail />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState icon="FileText" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
        </div>
      </div>
    </AppShell>
  );
}
