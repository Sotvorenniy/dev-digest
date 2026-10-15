"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { ReviewRecord } from "@devdigest/shared";
import { PrBriefCard } from "./_components/PrBriefCard";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadius } from "./_components/BlastRadius";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null | undefined;
  prNumber: number;
  hasFiles: boolean;
  latestReview: ReviewRecord | null;
}

export function OverviewTab({
  prBody,
  prId,
  repoId,
  repoFullName,
  headSha,
  prNumber,
  hasFiles,
  latestReview,
}: OverviewTabProps) {
  return (
    <>
      <PrBriefCard
        prId={prId}
        repoId={repoId}
        prNumber={prNumber}
        headSha={headSha}
        hasFiles={hasFiles}
        latestReview={latestReview}
      />
      <IntentCard prId={prId} />
      <BlastRadius prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
