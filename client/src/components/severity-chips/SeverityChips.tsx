/* SeverityChips — a findings breakdown as one icon+count chip per severity.
   Used by the PR list's FINDINGS column and by each run tile on the PR
   timeline; both then hang a FindingsPopover off the same hover. */
"use client";

import React from "react";
import { Icon, SEV, type Severity } from "@devdigest/ui";
import { WIRE_SEVERITIES, type SeverityCounts } from "./constants";
import { s } from "./styles";

export function SeverityChips({
  counts,
  hoverable = true,
}: {
  counts: SeverityCounts;
  /** Draws the dotted underline that marks the chips as a hover target. */
  hoverable?: boolean;
}) {
  const shown = WIRE_SEVERITIES.filter((sev) => (counts[sev] ?? 0) > 0);
  if (shown.length === 0) return <span style={s.muted}>—</span>;
  return (
    <span style={s.row}>
      {shown.map((sev) => {
        const meta = SEV[sev as Severity];
        const SevIcon = Icon[meta.icon];
        return (
          <span key={sev} className="tnum" style={s.chip(meta.c, hoverable)}>
            <SevIcon size={13} />
            {counts[sev]}
          </span>
        );
      })}
    </span>
  );
}

export default SeverityChips;
