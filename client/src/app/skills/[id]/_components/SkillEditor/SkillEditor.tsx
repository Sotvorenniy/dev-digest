/* SkillEditor — Config/Preview/Versions/Evals tab shell for a single skill.
   Tab state lives in the page's ?tab=, mirroring the /agents/:id AgentEditor. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { EvalsTab } from "./_components/EvalsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {/* Keyed by skill id so switching skills remounts each tab's draft
            state, same reasoning as the Agent editor's Config tab. */}
        {tab === "config" && <ConfigTab key={skill.id} skill={skill} />}
        {tab === "preview" && <PreviewTab key={skill.id} skill={skill} />}
        {tab === "versions" && <VersionsTab key={skill.id} skill={skill} />}
        {tab === "evals" && <EvalsTab key={skill.id} skill={skill} />}
      </div>
    </div>
  );
}
