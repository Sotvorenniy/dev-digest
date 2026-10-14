"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useContextDocs } from "@/lib/hooks";
import { DocList } from "./_components/DocList";
import { DocPreview } from "./_components/DocPreview";
import { SKELETON_ROWS } from "./constants";
import { isCloneUnavailable } from "./helpers";
import { s } from "./styles";

/** Project Context page for one repo: read-only list of the Markdown docs under
 *  the configured search roots, with a rendered preview. No editing (NG2). */
export function ContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch, isFetching } = useContextDocs(repoId);
  const [selected, setSelected] = React.useState<string | null>(null);

  const crumb = [{ label: t("title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const docs = data?.docs ?? [];
  const selectedDoc = docs.find((d) => d.path === selected) ?? null;
  const repoName = activeRepo?.full_name ?? "";

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle", { repo: repoName })}</p>
          </div>
          <Button kind="secondary" icon="RefreshCw" onClick={() => refetch()} loading={isFetching && !isLoading}>
            {t("rescan")}
          </Button>
        </div>

        {/* A failed refetch (e.g. 429) keeps the last list; say so and offer retry. */}
        {isError && data && (
          <div style={s.banner} role="alert">
            <span style={s.bannerText}>{t("loadError")}</span>
            <Button kind="ghost" size="sm" onClick={() => refetch()}>
              {t("retry")}
            </Button>
          </div>
        )}

        {data?.truncated && (
          <div style={s.banner} role="status" data-context-truncated>
            <span style={s.bannerText}>{t("truncated")}</span>
          </div>
        )}

        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <Skeleton key={i} height={36} />
            ))}
          </div>
        ) : isError && !data ? (
          <div style={s.box}>
            <ErrorState
              title={isCloneUnavailable(error) ? t("cloneUnavailable") : t("loadError")}
              body={!isCloneUnavailable(error) && error instanceof ApiError ? error.message : undefined}
              onRetry={() => refetch()}
            />
          </div>
        ) : docs.length === 0 ? (
          <div style={s.box}>
            <EmptyState
              icon="FileText"
              title={t("empty.title")}
              body={t("empty.body", { roots: (data?.search_roots ?? []).join(", ") })}
            />
          </div>
        ) : (
          <div style={s.split}>
            <DocList docs={docs} totalTokens={data?.total_tokens ?? 0} selected={selected} onSelect={setSelected} />
            <DocPreview repoId={repoId} path={selected} usedBy={selectedDoc?.used_by_agents ?? 0} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
