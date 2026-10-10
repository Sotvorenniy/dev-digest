"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ChangedSymbol, DownstreamImpact } from "@/lib/types";
import { callerHref } from "../../helpers";
import { s } from "../../styles";

interface SymbolGroupProps {
  impact: DownstreamImpact;
  /** Declaring file of the changed symbol, when known. */
  declaredIn?: ChangedSymbol["file"];
  defaultOpen?: boolean;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

export function SymbolGroup({ impact, declaredIn, defaultOpen, repoFullName, headSha }: SymbolGroupProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(defaultOpen ?? false);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <div style={s.group} data-blast-symbol={impact.symbol}>
      <button
        type="button"
        style={s.header}
        aria-expanded={open}
        aria-label={`${open ? t("collapse") : t("expand")} ${impact.symbol}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Chevron size={14} />
        <span className="mono" style={s.symbol}>
          {impact.symbol}
        </span>
        {declaredIn && (
          <span className="mono" style={s.file}>
            {declaredIn}
          </span>
        )}
        <span style={s.count}>{t("callerCount", { count: impact.callers.length })}</span>
      </button>
      {open && (
        <div style={s.body}>
          <ul style={s.callers}>
            {impact.callers.map((c) => {
              const href = callerHref(repoFullName, headSha, c.file, c.line);
              const loc = `${c.file}:${c.line}`;
              return (
                <li key={`${c.file}:${c.line}:${c.name}`} style={s.caller} data-blast-caller={loc}>
                  <span className="mono" style={s.callerName}>
                    {c.name}
                  </span>
                  {href ? (
                    <a className="mono" style={s.link} href={href} target="_blank" rel="noopener noreferrer">
                      {loc}
                    </a>
                  ) : (
                    <span className="mono" style={s.callerLoc}>
                      {loc}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {impact.endpoints_affected.length > 0 && (
            <div style={s.facts} data-blast-endpoints>
              <span style={s.factsLabel}>{t("endpointsLabel")}</span>
              {impact.endpoints_affected.map((e) => (
                <span key={e} className="mono" style={s.endpointChip}>
                  {e}
                </span>
              ))}
            </div>
          )}
          {impact.crons_affected.length > 0 && (
            <div style={s.facts} data-blast-crons>
              <span style={s.factsLabel}>{t("cronsLabel")}</span>
              {impact.crons_affected.map((c) => (
                <span key={c} className="mono" style={s.cronChip}>
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
