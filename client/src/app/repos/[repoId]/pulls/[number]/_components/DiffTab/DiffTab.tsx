"use client";

import React from "react";
import type { FindingActionKind, FindingRecord, PrFile } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useSmartDiff, useFindingAction } from "@/lib/hooks/reviews";
import { latestReviewPerAgent } from "@/lib/latest-reviews";
import { notify } from "@/lib/toast";
import { RoleGroup } from "./_components/RoleGroup";
import { SmartDiffHeader, type DiffOrder } from "./_components/SmartDiffHeader";
import { diffTotals, filesWithFindingsCount, findingsByPath, groupFiles } from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: reviews } = usePrReviews(prId);
  const { data: smart } = useSmartDiff(prId);
  const findingAction = useFindingAction();
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(true);
  const [order, setOrder] = React.useState<DiffOrder>("smart");

  // CURRENT findings only: the newest review of each agent (same rule as the PR list).
  const byPath = React.useMemo(
    () => findingsByPath(latestReviewPerAgent(reviews ?? []).flatMap((r) => r.findings)),
    [reviews],
  );
  const findingCount = React.useMemo(() => [...byPath.values()].reduce((n, list) => n + list.length, 0), [byPath]);
  const commentCount = (comments?.length ?? 0) + findingCount;
  const groups = React.useMemo(() => (smart ? groupFiles(files, smart) : null), [files, smart]);
  const totals = diffTotals(files);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findings: DiffFindingApi = {
    byPath,
    pendingId: findingAction.isPending ? findingAction.variables?.findingId : null,
    onAction: (finding: FindingRecord, action: FindingActionKind) =>
      findingAction.mutate({ findingId: finding.id, action, prId: prId ?? undefined }),
  };

  // Smart order needs the classification; while it loads (or fails) fall back to
  // the flat GitHub-order list rather than blocking the diff.
  const showGroups = order === "smart" && groups !== null && files.length > 0;

  return (
    <section style={s.section}>
      <SmartDiffHeader
        filesCount={filesCount}
        additions={totals.additions}
        deletions={totals.deletions}
        filesWithFindings={filesWithFindingsCount(files, byPath)}
        order={order}
        onOrderChange={setOrder}
        commentCount={commentCount}
        reviewed={(reviews?.length ?? 0) > 0}
        showComments={showComments}
        onToggleComments={() => setShowComments((v) => !v)}
      />
      {showGroups ? (
        <div style={s.groups}>
          {groups.map((g) => (
            <RoleGroup
              key={g.role}
              role={g.role}
              files={g.files}
              filesWithFindings={filesWithFindingsCount(g.files, byPath)}
              commenting={commenting}
              findings={findings}
            />
          ))}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findings} />
      )}
    </section>
  );
}
