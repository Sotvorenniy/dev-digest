"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, SectionLabel, Skeleton } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { SymbolGroup } from "./_components/SymbolGroup";
import { RESYNC_WAIT_MS } from "./constants";
import { blastTotals, reasonKey } from "./helpers";
import { s } from "./styles";

interface BlastRadiusProps {
  prId: string;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

export function BlastRadius({ prId, repoId, repoFullName, headSha }: BlastRadiusProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, refetch } = useBlastRadius(prId);
  const resync = useResyncRepoIntel(repoId);
  const [done, setDone] = React.useState(false);
  const waiting = resync.isSuccess && !done;
  // Poll the index state only while a resync is in flight; a new updatedAt/sha means it finished.
  const status = useRepoIntelStatus(repoId, waiting);
  const baseline = React.useRef<string | null>(null);
  const stamp = status.data ? `${status.data.lastIndexedSha}:${status.data.updatedAt}` : null;

  // A no-op resync never advances the stamp: stop waiting so the button is usable again.
  React.useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setDone(true), RESYNC_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  React.useEffect(() => {
    if (!waiting || stamp === null) return;
    if (baseline.current === null) {
      baseline.current = stamp;
    } else if (baseline.current !== stamp) {
      baseline.current = null;
      setDone(true);
      void refetch();
    }
  }, [waiting, stamp, refetch]);

  const onResync = () => {
    baseline.current = stamp;
    setDone(false);
    resync.mutate();
  };

  const totals = data ? blastTotals(data) : null;
  const declaredIn = new Map(data?.changed_symbols.map((c) => [c.name, c.file]) ?? []);

  return (
    <section data-blast-radius style={s.card}>
      <SectionLabel icon="GitBranch">{t("title")}</SectionLabel>
      {isLoading ? (
        <span data-blast-loading>
          <Skeleton height={60} />
        </span>
      ) : isError || !data || !totals ? (
        <div data-blast-error style={s.warning}>
          <span>{t("error")}</span>{" "}
          <Button size="sm" onClick={() => void refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <>
          {data.degraded && (
            <div style={s.degraded} data-blast-degraded={data.degraded_reason ?? "unknown"}>
              <Badge>{t("degraded.badge")}</Badge>
              <span>{t(`degraded.reason.${reasonKey(data.degraded_reason)}`)}</span>
              <span data-blast-resync>
                <Button
                  size="sm"
                  icon="RefreshCw"
                  loading={resync.isPending || waiting}
                  disabled={resync.isPending || waiting}
                  onClick={onResync}
                >
                  {resync.isPending || waiting ? t("resyncing") : t("resync")}
                </Button>
              </span>
              {waiting && <span style={s.muted}>{t("resyncQueued")}</span>}
            </div>
          )}
          <div style={s.chips} data-blast-summary>
            {(["symbols", "callers", "endpoints", "crons"] as const).map((k) => (
              <span key={k} style={s.chip} data-blast-stat={k}>
                <span style={s.chipValue}>{totals[k]}</span>
                {t(`stat.${k}`)}
              </span>
            ))}
          </div>
          {data.downstream.length === 0 ? (
            !data.degraded && (
              <span style={s.muted} data-blast-empty>
                {t("noDownstream", { count: data.changed_symbols.length })}
              </span>
            )
          ) : (
            <div style={s.tree} data-blast-tree>
              {data.downstream.map((d, i) => (
                <SymbolGroup
                  key={d.symbol}
                  impact={d}
                  declaredIn={declaredIn.get(d.symbol)}
                  defaultOpen={i === 0}
                  repoFullName={repoFullName}
                  headSha={headSha}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
