import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastRadius } from "@/lib/types";
import { FALLBACK_REASON_KEY, REASON_KEYS } from "./constants";

export interface BlastTotals {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Summary-chip counts derived from the payload (endpoints/crons are de-duplicated across symbols). */
export function blastTotals(data: BlastRadius): BlastTotals {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of data.downstream) {
    callers += d.callers.length;
    d.endpoints_affected.forEach((e) => endpoints.add(e));
    d.crons_affected.forEach((c) => crons.add(c));
  }
  return { symbols: data.changed_symbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}

/** i18n key suffix under `degraded.reason` for a server reason (unknown/absent → "unknown"). */
export function reasonKey(reason: string | null | undefined): string {
  if (reason && Object.prototype.hasOwnProperty.call(REASON_KEYS, reason)) {
    return REASON_KEYS[reason as keyof typeof REASON_KEYS];
  }
  return FALLBACK_REASON_KEY;
}

/** GitHub line link pinned to the PR head, or null when the repo or sha is unknown. */
export function callerHref(
  repoFullName: string | null | undefined,
  headSha: string | null | undefined,
  file: string,
  line: number,
): string | null {
  if (!repoFullName || !headSha) return null;
  return githubBlobUrl(repoFullName, headSha, file, line);
}
