/* FindingsCell — the PR list's FINDINGS column: a severity breakdown that
   opens a read-only preview of that PR's findings on hover. Counts and
   previews both ride in on PrMeta, so hovering costs nothing. */
"use client";

import React from "react";
import { SeverityChips } from "@/components/severity-chips";
import { FindingsPopover } from "@/components/findings-popover";
import type { PrMeta } from "@/lib/types";
import { countsOf } from "./helpers";
import { s } from "./styles";

export function FindingsCell({ pr }: { pr: PrMeta }) {
  const counts = React.useMemo(() => countsOf(pr), [pr]);
  const findings = pr.findings_preview ?? [];

  return (
    <div style={s.cell}>
      <FindingsPopover findings={findings}>
        <SeverityChips counts={counts} hoverable={findings.length > 0} />
      </FindingsPopover>
    </div>
  );
}

export default FindingsCell;
