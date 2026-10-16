"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useGenerateOnboarding, useOnboarding, useResyncForOnboarding } from "@/lib/hooks/onboarding";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { FileEntryList } from "./_components/FileEntryList";
import { RunLocallySection } from "./_components/RunLocallySection";
import { SectionCard } from "./_components/SectionCard";
import { StatusNotes } from "./_components/StatusNotes";
import { TourToc } from "./_components/TourToc";
import { SECTION_IDS, SECTION_ORDER, type SectionKey } from "./constants";
import { formatRelativeTime, generateErrorKind, statusNotes } from "./helpers";
import { s } from "./styles";

/** Onboarding Tour page for one repo: empty / generating / ready states, status
 *  notes, a TOC and five collapsible sections. */
export function OnboardingView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const [resyncPendingSince, setResyncPendingSince] = React.useState<number | null>(null);
  const { data, isLoading, isError, error, refetch } = useOnboarding(repoId, { resyncPendingSince });
  const generate = useGenerateOnboarding(repoId);
  const resync = useResyncForOnboarding(repoId);

  const repoName = activeRepo?.full_name ?? "";
  const crumb = [{ label: repoName }, { label: t("crumb") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const doResync = () => resync.mutate(undefined, { onSuccess: () => setResyncPendingSince(Date.now()) });

  const tour = data?.tour ?? null;
  const generating = data?.status === "generating";
  const busy = generating || generate.isPending;
  const errorKind = generate.isError ? generateErrorKind(generate.error) : null;

  const renderSection = (key: SectionKey) => {
    if (!tour) return null;
    const { sections, indexed_sha: sha } = tour;
    const fullName = repoName;
    switch (key) {
      case "architecture":
        return <ArchitectureSection architecture={sections.architecture} />;
      case "criticalPaths":
        return sections.critical_paths.length === 0 ? (
          <p style={s.empty}>{t("criticalPaths.empty")}</p>
        ) : (
          <FileEntryList
            repoFullName={fullName}
            sha={sha}
            entries={sections.critical_paths.map((p) => ({ path: p.path, note: p.why }))}
          />
        );
      case "runLocally":
        return <RunLocallySection commands={sections.run_locally} />;
      case "readingPath":
        return sections.reading_path.length === 0 ? (
          <p style={s.empty}>{t("readingPath.empty")}</p>
        ) : (
          <FileEntryList
            repoFullName={fullName}
            sha={sha}
            entries={sections.reading_path.map((p) => ({
              path: p.path,
              note: p.reason,
              meta: t("readingPath.score", { score: p.score.toFixed(2) }),
            }))}
          />
        );
      case "firstTasks":
        return sections.first_tasks.length === 0 ? (
          <p style={s.empty}>{t("firstTasks.empty")}</p>
        ) : (
          <ul style={s.list}>
            {sections.first_tasks.map((task) => (
              <li key={task.title} data-onboarding-task>
                <div style={s.taskTitle}>{task.title}</div>
                <p style={s.taskWhy}>{task.why}</p>
                <FileEntryList
                  repoFullName={fullName}
                  sha={sha}
                  entries={task.paths.map((path) => ({ path }))}
                />
              </li>
            ))}
          </ul>
        );
    }
  };

  const body = isLoading ? (
    <div style={s.loadingStack}>
      <Skeleton height={140} />
      <Skeleton height={140} />
    </div>
  ) : isError ? (
    <div style={s.errorBox}>
      <ErrorState
        title={t("loadError")}
        body={error instanceof ApiError ? error.message : undefined}
        onRetry={() => refetch()}
      />
    </div>
  ) : tour ? (
    <div style={s.body}>
      <TourToc />
      <div style={s.main}>
        <StatusNotes notes={statusNotes(tour, data?.is_stale ?? false)} />
        {SECTION_ORDER.map((key) => (
          <SectionCard key={key} id={SECTION_IDS[key]} sectionKey={key} title={t(`sections.${key}`)}>
            {renderSection(key)}
          </SectionCard>
        ))}
      </div>
    </div>
  ) : !generating && data ? (
    <div style={s.emptyBox}>
      {data.index.usable ? (
        <EmptyState
          icon="FileText"
          title={t("empty.title")}
          body={t("empty.body")}
          cta={t("actions.generate")}
          onCta={() => generate.mutate()}
          ctaLoading={busy}
        />
      ) : (
        <EmptyState
          icon="FileText"
          title={t("empty.notIndexedTitle")}
          body={t("empty.notIndexedBody")}
          cta={t("empty.resync")}
          onCta={doResync}
          ctaLoading={resync.isPending}
        />
      )}
    </div>
  ) : null;

  const subtitle = tour
    ? t("subtitle", {
        count: tour.files_indexed,
        when: formatRelativeTime(tour.generated_at) ?? tour.generated_at,
      })
    : null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("title", { name: repoName })}</h1>
            {subtitle && <p style={s.subtitle}>{subtitle}</p>}
          </div>
          {tour && (
            <div style={s.headerActions}>
              <Button
                kind="secondary"
                icon="RefreshCw"
                onClick={() => generate.mutate()}
                disabled={busy}
                loading={busy}
              >
                {t("actions.regenerate")}
              </Button>
            </div>
          )}
        </div>

        {generating && (
          <div role="status" style={s.status} data-onboarding-status>
            {t("status.generating")}
          </div>
        )}

        {errorKind && (
          <div role="alert" style={s.alert} data-onboarding-error>
            <span>{t(`errors.${errorKind}`)}</span>
            {errorKind === "notIndexed" && (
              <Button kind="secondary" size="sm" onClick={doResync} loading={resync.isPending}>
                {t("empty.resync")}
              </Button>
            )}
            {errorKind === "generic" && (
              <Button kind="secondary" size="sm" onClick={() => generate.mutate()} disabled={busy}>
                {t("errors.retry")}
              </Button>
            )}
          </div>
        )}

        {resync.isError && !resync.isPending && (
          <div role="alert" style={s.alert} data-onboarding-resync-error>
            <span>{t("errors.resync")}</span>
          </div>
        )}

        {body}
      </div>
    </AppShell>
  );
}
