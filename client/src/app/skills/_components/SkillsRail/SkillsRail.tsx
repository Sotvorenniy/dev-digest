/* SkillsRail — the left column on both /skills and /skills/:id: search, an
   "Add Skill" menu (create from scratch or open the import drawer to a given
   tab), and the compact skill list. Mirrors the /agents/:id left rail. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useCreateSkill, useSkills, useUpdateSkill } from "@/lib/hooks";
import { ImportSkillDrawer, type ImportTab } from "../ImportSkillDrawer";
import { filterSkills, needsVetting } from "./helpers";
import { s } from "./styles";

function SkillRow({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active: boolean;
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const vetting = needsVetting(skill);
  return (
    <div onClick={onClick} style={s.row(active, skill.enabled)}>
      <div style={s.rowHeader}>
        <div style={s.iconBox}>
          <Icon.FileText size={13} />
        </div>
        <span style={s.name}>{skill.name}</span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </div>
      </div>
      <div style={s.description}>{skill.description || "—"}</div>
      <div style={s.metaRow}>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-muted)">{t(`listItem.source.${skill.source}`)}</Badge>
        {vetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
    </div>
  );
}

export function SkillsRail({ activeId, tab = "config" }: { activeId?: string | null; tab?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [drawerTab, setDrawerTab] = React.useState<ImportTab | null>(null);

  const list = filterSkills(skills ?? [], search);

  const createFromScratch = () => {
    create.mutate(
      { name: "untitled-skill", description: "", type: "custom", body: "", source: "manual", enabled: true },
      { onSuccess: (skill) => router.push(`/skills/${skill.id}?tab=config`) },
    );
  };

  return (
    <div style={s.wrap}>
      {drawerTab && <ImportSkillDrawer initialTab={drawerTab} onClose={() => setDrawerTab(null)} />}
      <div style={s.header}>
        <h1 style={s.h1}>{t("page.heading")}</h1>
        <Dropdown
          width={220}
          align="right"
          trigger={
            <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
              {t("page.addSkill")}
            </Button>
          }
          items={[
            { label: t("page.createFromScratch"), icon: "Edit", onClick: createFromScratch },
            { divider: true },
            { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setDrawerTab("file") },
            { label: t("page.menu.fromUrl"), icon: "Globe", onClick: () => setDrawerTab("url") },
            { label: t("page.menu.community"), icon: "Users", onClick: () => setDrawerTab("community") },
          ]}
        />
      </div>
      <div style={s.search}>
        <Icon.Search size={13} style={s.searchIcon} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("page.searchPlaceholder")}
          style={s.searchInput}
        />
      </div>
      <div style={s.list}>
        {isLoading && (
          <>
            <Skeleton height={82} />
            <Skeleton height={82} />
            <Skeleton height={82} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="FileText"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setDrawerTab("file")}
          />
        )}
        {list.map((sk) => (
          <SkillRow
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
          />
        ))}
      </div>
    </div>
  );
}
