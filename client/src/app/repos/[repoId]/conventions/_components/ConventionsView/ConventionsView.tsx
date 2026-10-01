"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useConventions, useRunConventionScan, useSetConventionCandidateStatus } from "@/lib/hooks/conventions";
import { ConventionCandidateCard } from "../ConventionCandidateCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { SKELETON_ROWS } from "./constants";
import { formatRelativeTime } from "./helpers";
import { s } from "./styles";

/** Conventions scan → review → Create-skill page for one repo. Toolbar (Deselect
 *  all / accepted counter / Create skill / Run Scan-or-Re-scan) sits above the
 *  loading/error/empty/list body, mirroring the Pull Requests page's shell. */
export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const runScan = useRunConventionScan(repoId);
  const setStatus = useSetConventionCandidateStatus(repoId);

  const [creatingSkill, setCreatingSkill] = React.useState(false);
  const [deselecting, setDeselecting] = React.useState(false);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const candidates = data?.candidates ?? [];
  const scan = data?.scan;
  const acceptedCandidates = candidates.filter((c) => c.status === "accepted");
  const acceptedCount = acceptedCandidates.length;
  const totalCount = candidates.length;

  const scanBusy = scan?.status === "queued" || scan?.status === "running";
  const neverScanned = !scan || scan.status === "never_run";

  const subtitle =
    scan && scan.finished_at
      ? t("page.detectedFrom", {
          count: scan.sampled_file_count,
          when: formatRelativeTime(scan.finished_at) ?? scan.finished_at,
        })
      : t("page.subtitle");

  const deselectAll = async () => {
    setDeselecting(true);
    try {
      await Promise.all(acceptedCandidates.map((c) => setStatus.mutateAsync({ id: c.id, status: "pending" })));
    } finally {
      setDeselecting(false);
    }
  };

  return (
    <AppShell crumb={crumb}>
      {creatingSkill && (
        <CreateSkillModal
          repoId={repoId}
          repoName={repoName}
          acceptedCandidates={acceptedCandidates}
          onClose={() => setCreatingSkill(false)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.headingPrefix") + repoName}</h1>
            <p style={s.subtitle}>{subtitle}</p>
          </div>
          <div style={s.headerActions}>
            <Button
              kind={neverScanned ? "primary" : "secondary"}
              icon="Play"
              onClick={() => runScan.mutate()}
              disabled={!neverScanned || scanBusy || runScan.isPending}
              loading={neverScanned && (scanBusy || runScan.isPending)}
            >
              {neverScanned && scanBusy ? t("page.scanning") : t("page.runScan")}
            </Button>
            <Button
              kind="secondary"
              icon="RefreshCw"
              onClick={() => runScan.mutate()}
              disabled={neverScanned || scanBusy || runScan.isPending}
              loading={!neverScanned && (scanBusy || runScan.isPending)}
            >
              {!neverScanned && scanBusy ? t("page.scanning") : t("page.rescan")}
            </Button>
          </div>
        </div>

        <div style={s.toolbar}>
          <Button
            kind="ghost"
            onClick={deselectAll}
            disabled={deselecting || acceptedCount === 0}
          >
            {t("page.deselectAll")}
          </Button>
          <span style={s.acceptedCount}>{t("page.acceptedCount", { accepted: acceptedCount, total: totalCount })}</span>
          <div style={s.toolbarSpacer} />
          {acceptedCount > 0 && (
            <Button kind="primary" icon="Sparkles" onClick={() => setCreatingSkill(true)}>
              {t("page.createSkill")}
            </Button>
          )}
        </div>

        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <Skeleton key={i} height={140} />
            ))}
          </div>
        ) : isError ? (
          <div style={s.errorBox}>
            <ErrorState
              title={t("page.loadError")}
              body={error instanceof ApiError ? error.message : undefined}
              onRetry={() => refetch()}
            />
          </div>
        ) : neverScanned && candidates.length === 0 ? (
          <div style={s.emptyBox}>
            <EmptyState
              icon="Sparkles"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={() => runScan.mutate()}
              ctaLoading={scanBusy || runScan.isPending}
            />
          </div>
        ) : (
          <>
            <div style={s.candidateCount}>{t("page.candidateCount", { count: totalCount })}</div>
            <div style={s.list}>
              {candidates.map((c) => (
                <ConventionCandidateCard key={c.id} repoId={repoId} candidate={c} />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
