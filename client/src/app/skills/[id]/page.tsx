/* /skills/:id — Skill Editor. Left skill rail + tabbed editor (Config/
   Preview/Versions/Evals). Tab state lives in ?tab=. Mirrors /agents/:id. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { SkillsRail } from "../_components/SkillsRail";
import { SkillEditor } from "./_components/SkillEditor";
import { useSkill } from "../../../lib/hooks/skills";
import { ApiError } from "../../../lib/api";

const VALID_TABS = ["config", "preview", "versions", "evals"];

export default function SkillEditorPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;
  const t = useTranslations("skills");

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (tb: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", tb);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("editor.skillFallback") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        <SkillsRail activeId={id} tab={tab} />

        {isLoading || !skill ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 }}>
              <Icon.FileText size={18} style={{ color: "var(--accent)" }} />
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>{skill.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {skill.type}
              </Badge>
              <Badge color="var(--text-muted)" mono>{`v${skill.version}`}</Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
              <div style={{ marginLeft: "auto" }}>
                <Button kind="secondary" size="sm" icon="FlaskConical" disabled title={t("editor.runOnEvals")}>
                  {t("editor.runOnEvals")}
                </Button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
