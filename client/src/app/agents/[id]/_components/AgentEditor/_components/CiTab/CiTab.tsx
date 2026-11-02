/* CiTab — where this agent runs in CI, the "Fail CI on" threshold and the Add-to-CI wizard. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button, EmptyState } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useCiInstallations, useUpdateAgent } from "@/lib/hooks";
import { FAIL_ON_SEGMENTS } from "./constants";
import { isGithubPrUrl, selectedFailOnSegment } from "./helpers";
import { s } from "./styles";
import { ExportWizard } from "./_components/ExportWizard";

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const format = useFormatter();
  const installs = useCiInstallations(agent.id);
  const update = useUpdateAgent();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const segRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const rows = installs.data ?? [];
  const selected = selectedFailOnSegment(agent.ci_fail_on);

  const choose = (value: (typeof FAIL_ON_SEGMENTS)[number]["value"]) => {
    if (value === selected || update.isPending) return;
    update.mutate({ id: agent.id, patch: { ci_fail_on: value } });
  };

  const onSegKey = (e: React.KeyboardEvent, i: number) => {
    const last = FAIL_ON_SEGMENTS.length - 1;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    if (next < 0) return;
    e.preventDefault();
    segRefs.current[next]?.focus();
    choose(FAIL_ON_SEGMENTS[next]!.value);
  };

  const addButton = (
    <Button kind="primary" icon="Plus" onClick={() => setOpen(true)} data-ci-add>
      {t("tab.addToCi")}
    </Button>
  );

  return (
    <div ref={rootRef} style={s.root} data-ci-tab>
      <div style={s.header}>
        <h2 style={s.heading}>{t("tab.title")}</h2>
        {rows.length > 0 && <Badge>{t("tab.activeIn", { count: rows.length })}</Badge>}
        <div style={s.spacer} />
        {rows.length > 0 && addButton}
      </div>

      {installs.isError && <div role="alert" style={s.error}>{t("tab.loadError")}</div>}

      {!installs.isError && !installs.isLoading && rows.length === 0 && (
        <div data-ci-empty>
          <EmptyState title={t("tab.empty.title")} body={t("tab.empty.body")} />
          <div style={{ display: "flex", justifyContent: "center" }}>{addButton}</div>
        </div>
      )}

      {rows.length > 0 && (
        <ul style={s.list}>
          {rows.map((r) => (
            <li key={r.id} style={s.row} data-ci-installation>
              <span style={s.repo} title={r.repo}>{r.repo}</span>
              <Badge>{t("tab.ghaChip")}</Badge>
              {isGithubPrUrl(r.pr_url) && (
                <a href={r.pr_url} target="_blank" rel="noopener noreferrer" style={s.link}>
                  {t("tab.prOpened")}
                </a>
              )}
              <span style={s.meta}>{format.relativeTime(new Date(r.installed_at))}</span>
            </li>
          ))}
        </ul>
      )}

      <div style={s.failOnRow}>
        <span id="ci-fail-on-label" style={s.label}>{t("tab.failOn.label")}</span>
        <div role="radiogroup" aria-labelledby="ci-fail-on-label" style={s.segGroup} data-ci-fail-on>
          {FAIL_ON_SEGMENTS.map((seg, i) => {
            const checked = seg.value === selected;
            return (
              <button
                key={seg.value}
                ref={(el) => {
                  segRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked || (selected === null && i === 0) ? 0 : -1}
                style={{ ...s.seg, ...(checked ? s.segActive : null) }}
                onClick={() => choose(seg.value)}
                onKeyDown={(e) => onSegKey(e, i)}
                data-ci-fail-on-option={seg.value}
              >
                {t(seg.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {open && (
        <ExportWizard
          agent={agent}
          onClose={() => {
            setOpen(false);
            rootRef.current?.querySelector<HTMLElement>("[data-ci-add]")?.focus();
          }}
        />
      )}
    </div>
  );
}
