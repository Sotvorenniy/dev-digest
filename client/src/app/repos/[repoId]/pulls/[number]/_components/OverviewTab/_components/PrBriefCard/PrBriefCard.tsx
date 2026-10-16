"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, SectionLabel, Skeleton } from "@devdigest/ui";
import { useBrief, useGenerateBrief } from "@/lib/hooks/brief";
import type { ReviewRecord } from "@devdigest/shared";
import type { PrBrief } from "@/lib/types";
import { SETTINGS_HREF } from "./constants";
import { formatCost } from "@/components/run-cost-badge/helpers";
import { VerdictBanner } from "../../../VerdictBanner";
import { briefErrorKind, isStale, latestVerdictInfo } from "./helpers";
import { RiskRow } from "./_components/RiskRow";
import { ReviewFocusList } from "./_components/ReviewFocusList";
import { s } from "./styles";

interface PrBriefCardProps {
  prId: string;
  repoId: string;
  prNumber: number;
  headSha: string | null | undefined;
  hasFiles: boolean;
  /** Newest review that has a verdict; consumed by the P3 verdict banner. */
  latestReview?: ReviewRecord | null;
}

function BriefBody({
  brief,
  repoId,
  prNumber,
  latestReview,
}: {
  brief: PrBrief;
  repoId: string;
  prNumber: number;
  latestReview?: ReviewRecord | null;
}) {
  const t = useTranslations("brief");
  const risks = brief.risks.risks;
  const focus = brief.review_focus ?? [];
  const missing = brief.missing_inputs ?? [];
  const verdictInfo = latestVerdictInfo(latestReview);
  const hasUsage = brief.tokens_in != null || brief.tokens_out != null;
  return (
    <>
      {verdictInfo && (
        <div data-brief-verdict>
          <VerdictBanner
            verdict={verdictInfo.verdict}
            summary={null}
            score={verdictInfo.score}
            findingsCount={verdictInfo.findingsCount}
            blockers={verdictInfo.blockers}
          />
        </div>
      )}
      {brief.summary && <p style={s.summary}>{brief.summary}</p>}
      <div data-brief-risks>
        <div style={s.blockLabel}>{t("block.risks")}</div>
        {risks.length === 0 ? (
          <span style={s.none}>{t("noRisks")}</span>
        ) : (
          <ul style={s.list}>
            {risks.map((r, i) => (
              <RiskRow key={`${r.title}:${i}`} risk={r} repoId={repoId} prNumber={prNumber} />
            ))}
          </ul>
        )}
      </div>
      {focus.length > 0 && (
        <div data-brief-focus>
          <div style={s.blockLabel}>{t("block.reviewFocus")}</div>
          <ReviewFocusList items={focus} repoId={repoId} prNumber={prNumber} />
        </div>
      )}
      <div style={s.meta} data-brief-meta>
        {t("meta.cost", { cost: formatCost(brief.cost_usd) })}
        {hasUsage && ` · ${t("meta.tokensInOut", { in: brief.tokens_in ?? "—", out: brief.tokens_out ?? "—" })}`}
      </div>
      {missing.length > 0 && (
        <div style={s.missing} data-brief-missing>
          {t("missing.title")}:{" "}
          {missing
            .map((m) => `${t(`missing.input.${m.input}`)} (${t(`missing.reason.${m.reason}`)})`)
            .join(", ")}
        </div>
      )}
    </>
  );
}

export function PrBriefCard({ prId, repoId, prNumber, headSha, hasFiles, latestReview }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const { data: brief, isLoading } = useBrief(prId);
  const generate = useGenerateBrief(prId);
  const pending = generate.isPending;
  const stale = isStale(brief, headSha);
  const errorKind = generate.isError ? briefErrorKind(generate.error) : null;
  const generatedAt = brief?.generated_at ? new Date(brief.generated_at).toLocaleString() : null;

  return (
    <section data-pr-brief style={s.card}>
      <SectionLabel
        icon="Sparkles"
        right={
          brief ? (
            <span style={s.actions}>
              {generatedAt && <span style={s.meta}>{t("generatedAt", { date: generatedAt })}</span>}
              <Button
                size="sm"
                icon="RefreshCw"
                aria-label={t("refresh")}
                title={t("refresh")}
                loading={pending}
                disabled={pending}
                onClick={() => generate.mutate()}
                data-brief-refresh
              />
            </span>
          ) : null
        }
      >
        {t("title")}
      </SectionLabel>

      <div aria-live="polite" data-brief-status style={s.status}>
        {pending && <span style={s.statusLine}>{t("generating")}</span>}
        {!pending && stale && <span style={s.warning}>{t("stale")}</span>}
        {errorKind && (
          <span style={s.warning} data-brief-error={errorKind}>
            {t(`error.${errorKind}`)}
            {errorKind === "noKey" && (
              <Link href={SETTINGS_HREF} style={s.link}>
                {t("settingsLink")}
              </Link>
            )}
            <Button
              size="sm"
              kind="secondary"
              disabled={pending}
              onClick={() => generate.mutate()}
              data-brief-retry
            >
              {t("retry")}
            </Button>
          </span>
        )}
      </div>

      {isLoading ? (
        <Skeleton height={60} />
      ) : brief ? (
        <BriefBody brief={brief} repoId={repoId} prNumber={prNumber} latestReview={latestReview} />
      ) : (
        <>
          {pending ? (
            <div data-brief-skeleton>
              <Skeleton height={60} />
            </div>
          ) : (
            <span style={s.none}>{hasFiles ? t("empty") : t("emptyPr")}</span>
          )}
          <div>
            <Button
              kind="primary"
              size="sm"
              icon="Sparkles"
              loading={pending}
              disabled={!hasFiles || pending}
              onClick={() => generate.mutate()}
              data-brief-generate
            >
              {t("generate")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
