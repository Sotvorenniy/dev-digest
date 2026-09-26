import type { PrMeta } from "@/lib/types";
import type { SeverityCounts } from "@/components/severity-chips";
import { FINDINGS_FIELDS } from "../../constants";

/** The PR's latest-review severity tallies, as the chips want them. */
export function countsOf(pr: PrMeta): SeverityCounts {
  const counts: SeverityCounts = {};
  for (const { sev, field } of FINDINGS_FIELDS) counts[sev] = pr[field] ?? 0;
  return counts;
}
