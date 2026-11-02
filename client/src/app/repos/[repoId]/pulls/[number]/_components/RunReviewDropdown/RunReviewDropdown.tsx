/* RunReviewDropdown — popover with one checkbox per enabled agent.
   "Run multi-agent review (N)" → POST /pulls/:id/review { agent_ids } in click
   order, hands the runIds up for live status, then opens /multi-agent/:prId. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { ApiError } from "../../../../../../../lib/api";
import { DROPDOWN_WIDTH } from "./constants";
import { s } from "./styles";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents } = useAgents();
  const run = useRunReview();
  const enabled = (agents ?? []).filter((a) => a.enabled);

  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]); // click order
  const [rateLimited, setRateLimited] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, []);

  const count = selected.length;

  const toggle = (id: string, on: boolean) =>
    setSelected((cur) => (on ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id)));

  const submit = async () => {
    setRateLimited(false);
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, agentIds: selected });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
      router.push(`/multi-agent/${prId}?agents=${selected.join(",")}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) setRateLimited(true);
    } finally {
      onRunSettled?.();
    }
  };

  return (
    <div ref={ref} style={s.root}>
      <div onClick={() => setOpen((o) => !o)}>
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={warnMerged ? { opacity: 0.6 } : undefined}
        >
          <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={run.isPending}>
            {run.isPending ? t("runReview.running") : t("runReview.runReview")}
          </Button>
        </span>
      </div>
      {open && (
        <div role="group" aria-label={t("runReview.pickAgents")} style={{ ...s.panel, width: DROPDOWN_WIDTH }}>
          {warnMerged && <div style={s.muted}>{t("runReview.mergedWarning")}</div>}
          {enabled.length === 0 ? (
            <div style={s.muted}>{t("runReview.noEnabled")}</div>
          ) : (
            enabled.map((a) => (
              <div key={a.id} style={s.option} data-agent-option={a.id}>
                <Checkbox checked={selected.includes(a.id)} onChange={(v) => toggle(a.id, v)} label={a.name} />
              </div>
            ))
          )}
          <div style={s.actions}>
            <Button kind="secondary" size="sm" onClick={() => setSelected([])}>
              {t("runReview.clear")}
            </Button>
            <span data-run-multi>
              <Button size="sm" disabled={count === 0 || run.isPending} onClick={submit}>
                {t("runReview.runMulti", { count })}
              </Button>
            </span>
          </div>
          {rateLimited && (
            <div role="alert" style={s.error}>
              {t("runReview.rateLimited")}
            </div>
          )}
          <button type="button" style={s.link} onClick={() => router.push("/agents")}>
            {t("runReview.configureAgents")}
          </button>
        </div>
      )}
    </div>
  );
}
