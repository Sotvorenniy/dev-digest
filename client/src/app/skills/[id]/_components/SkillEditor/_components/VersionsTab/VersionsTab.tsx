"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks";
import { DiffViewer } from "@/components/diff-viewer";
import type { PrFile } from "@/lib/types";
import { currentVersionOf, diffAgainstCurrent, formatWhen, sortedByVersionDesc } from "./helpers";
import { s } from "./styles";

/** Versions tab — newest first. Every row but the current one diffs and
 *  restores against the CURRENT version (the highest version number), not
 *  sequentially against its neighbor. */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion(skill.id);
  const [diffing, setDiffing] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={54} />
        <Skeleton height={54} />
        <Skeleton height={54} />
      </div>
    );
  }
  if (isError) {
    return (
      <div style={s.wrap}>
        <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  const list = sortedByVersionDesc(versions ?? []);
  const current = currentVersionOf(versions ?? []);
  const diffRow = diffing != null ? list.find((v) => v.version === diffing) : undefined;

  const restoreVersion = (version: number) => {
    if (window.confirm(t("versions.restoreConfirm", { version }))) restore.mutate(version);
  };

  return (
    <div style={s.wrap}>
      {diffRow && current && (
        <Modal
          width={860}
          title={t("versions.diffModalTitle", { version: diffRow.version })}
          onClose={() => setDiffing(null)}
        >
          <div style={s.modalBody}>
            <DiffViewer
              files={[
                (() => {
                  const { patch, additions, deletions } = diffAgainstCurrent(
                    `v${diffRow.version}`,
                    `v${current.version}`,
                    diffRow.body,
                    current.body,
                  );
                  return { path: `${skill.name}.md`, additions, deletions, patch } satisfies PrFile;
                })(),
              ]}
            />
          </div>
        </Modal>
      )}
      {list.length === 0 && <div style={s.empty}>{t("versions.empty")}</div>}
      {list.map((v) => {
        const isCurrent = current != null && v.version === current.version;
        const restoringThis = restore.isPending && restore.variables === v.version;
        return (
          <div key={v.version} style={s.row}>
            <div style={s.rowMain}>
              <span style={s.version}>{`v${v.version}`}</span>
              {isCurrent && (
                <Badge color="var(--ok)" bg="var(--ok-bg)">
                  {t("versions.current")}
                </Badge>
              )}
              <span style={s.note}>{v.change_note || t("versions.updatedFallback")}</span>
            </div>
            <div style={s.rowMeta}>
              <span style={s.date}>{formatWhen(v.created_at)}</span>
              {!isCurrent && (
                <div style={s.actions}>
                  <Button kind="secondary" size="sm" icon="Eye" onClick={() => setDiffing(v.version)}>
                    {t("versions.diff")}
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="RefreshCw"
                    onClick={() => restoreVersion(v.version)}
                    disabled={restore.isPending}
                  >
                    {restoringThis ? t("versions.restoring") : t("versions.restore")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
