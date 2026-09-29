/* /skills — Skills Lab index: the skills rail on the left and a "select a
   skill" prompt on the right. The full editor lives at /skills/:id. */
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
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <EmptyState title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
        </div>
      </div>
    </AppShell>
  );
}
