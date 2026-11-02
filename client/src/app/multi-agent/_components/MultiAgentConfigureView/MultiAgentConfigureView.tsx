"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell/PageShell";
import { presetPeriod } from "@/components/period-picker";
import { formatCost } from "@/components/run-cost-badge/helpers";
import { ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/agent-metrics";
import { latestReviewPerAgent } from "@/lib/latest-reviews";
import { useActiveRepo } from "@/lib/repo-context";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentsStats } from "@/lib/hooks/agent-stats";
import { usePulls } from "@/lib/hooks/core";
import { usePrReviews, useRunReview } from "@/lib/hooks/reviews";
import { estimateOf, openPulls, sumEstimates } from "./helpers";
import { s } from "./styles";
import { AgentPickCard } from "./_components/AgentPickCard";

/** /multi-agent — choose a PR and agents, see per-agent estimates, start one multi-agent run. */
export function MultiAgentConfigureView() {
  const t = useTranslations("runs");
  const router = useRouter();
  const { repoId } = useActiveRepo();
  const { data: agents } = useAgents();
  const { data: pulls } = usePulls(repoId);
  const run = useRunReview();
  const [period] = React.useState(() => presetPeriod("30d", Date.now()));

  const enabled = (agents ?? []).filter((a) => a.enabled);
  const open = openPulls(pulls ?? []);

  const [prChoice, setPrChoice] = React.useState("");
  const prId = open.some((p) => p.id === prChoice) ? prChoice : (open[0]?.id ?? "");
  const [selected, setSelected] = React.useState<string[]>([]); // selection order
  const [rateLimited, setRateLimited] = React.useState(false);

  const { data: reviews } = usePrReviews(prId || null);
  const latest = latestReviewPerAgent(reviews ?? []);
  const statsList = useAgentsStats(enabled.map((a) => a.id), period);
  const estimates = new Map(enabled.map((a, i) => [a.id, estimateOf(statsList[i]?.data)]));

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const totals = sumEstimates(selected.map((id) => estimates.get(id) ?? null));
  const canRun = selected.length > 0 && !!prId && !run.isPending;

  const submit = async () => {
    setRateLimited(false);
    try {
      await run.mutateAsync({ prId, agentIds: selected });
      router.push(`/multi-agent/${prId}?agents=${selected.join(",")}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) setRateLimited(true);
    }
  };

  let body: React.ReactNode;
  if (agents && enabled.length === 0) {
    body = (
      <div style={s.empty} data-multi-agent-empty>
        <EmptyState icon="Cpu" title={t("page.noAgents.title")} body={t("page.noAgents.body")} />
        <Link href="/agents" style={s.link}>
          {t("page.noAgents.cta")}
        </Link>
      </div>
    );
  } else {
    body = (
      <div style={s.root}>
        <div style={s.field}>
          <label htmlFor="multi-agent-pr" style={s.label}>
            {t("page.configure.prLabel")}
          </label>
          <select
            id="multi-agent-pr"
            data-pr-select
            style={s.select}
            value={prId}
            onChange={(e) => setPrChoice(e.target.value)}
            disabled={open.length === 0}
          >
            {open.map((p) => (
              <option key={p.id} value={p.id}>
                {t("page.prItem", { number: p.number, title: p.title })}
              </option>
            ))}
          </select>
          {open.length === 0 && <div style={s.cardMeta}>{t("page.noRun.bodySelect")}</div>}
        </div>
        <div style={s.field}>
          <span style={s.label}>{t("page.configure.agentsLabel")}</span>
          <div style={s.cards} role="group" aria-label={t("page.configure.agentsLabel")}>
            {enabled.map((a) => {
              const est = estimates.get(a.id) ?? null;
              return (
                <AgentPickCard
                  key={a.id}
                  id={a.id}
                  name={a.name}
                  summary={latest.find((r) => r.agent_id === a.id)?.summary ?? ""}
                  estimate={
                    est
                      ? t("page.configure.estimate", {
                          duration: formatDuration(est.durationMs),
                          cost: formatCost(est.costUsd),
                        })
                      : t("page.configure.noEstimate")
                  }
                  selected={selected.includes(a.id)}
                  onToggle={() => toggle(a.id)}
                />
              );
            })}
          </div>
        </div>
        <div style={s.footer}>
          {selected.length > 0 && (
            <span style={s.footerText} data-estimate-footer>
              {t("page.configure.footer", {
                duration: formatDuration(totals.durationMs),
                cost: formatCost(totals.costUsd),
              })}
            </span>
          )}
          <span data-run-multi>
            <Button disabled={!canRun} onClick={submit}>
              {t("page.configure.run", { count: selected.length })}
            </Button>
          </span>
        </div>
        {rateLimited && (
          <div role="alert" style={s.error}>
            {t("page.configure.rateLimited")}
          </div>
        )}
      </div>
    );
  }

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <PageContainer title={t("page.title")} subtitle={t("page.subtitle")}>
        {body}
      </PageContainer>
    </AppShell>
  );
}

export default MultiAgentConfigureView;
