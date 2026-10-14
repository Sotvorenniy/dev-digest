"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextDocs, useSkillContext, useSetSkillContext } from "@/lib/hooks";
import { ContextDocPicker } from "@/components/context-doc-picker";

/** Context tab — "Project context to use": docs from the active repo that ride
 *  along whenever this skill is attached to an agent. */
export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();
  const docs = useContextDocs(repoId);
  const attachments = useSkillContext(skill.id, repoId);
  const save = useSetSkillContext(skill.id, repoId ?? "");

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{t("editor.context.title")}</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 14 }}>
        {t("editor.context.hint")}
      </p>
      {!repoId ? (
        <EmptyState icon="FileText" title={t("editor.context.noRepo")} />
      ) : docs.isLoading || attachments.isLoading ? (
        <Skeleton height={120} />
      ) : docs.isError || attachments.isError || !docs.data || !attachments.data ? (
        <ErrorState
          title={t("editor.context.loadError")}
          onRetry={() => {
            docs.refetch();
            attachments.refetch();
          }}
        />
      ) : (
        <ContextDocPicker
          repoId={repoId}
          docs={docs.data.docs}
          attached={attachments.data.paths}
          missing={attachments.data.missing}
          onChange={(paths) => save.mutate(paths)}
          saving={save.isPending}
          saveError={save.isError}
          header="count"
        />
      )}
    </div>
  );
}
