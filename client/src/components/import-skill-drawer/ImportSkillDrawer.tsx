/* ImportSkillDrawer — Drawer + Tabs shell for the three import paths (file /
   URL / community). Opened from SkillsRail's "Add Skill" menu to the matching
   tab; each tab handles its own submission and closes the drawer on success. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { TABS, type ImportTab } from "./constants";
import { FileTab } from "./_components/FileTab";
import { UrlTab } from "./_components/UrlTab";
import { CommunityTab } from "./_components/CommunityTab";
import { s } from "./styles";

export function ImportSkillDrawer({
  initialTab,
  onClose,
  onImported,
}: {
  initialTab: ImportTab;
  onClose: () => void;
  /** Called with the newly created skill after a successful import. */
  onImported?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<ImportTab>(initialTab);
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <Drawer width={560} title={t("drawer.title")} subtitle={t("drawer.subtitle")} onClose={onClose}>
      <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as ImportTab)} pad="0" />
      <div style={s.body}>
        {tab === "file" && <FileTab onDone={onClose} onImported={onImported} />}
        {tab === "url" && <UrlTab onDone={onClose} onImported={onImported} />}
        {tab === "community" && <CommunityTab />}
      </div>
    </Drawer>
  );
}
