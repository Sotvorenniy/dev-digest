import type { ReviewLite, Severity } from '../api/schemas.js';
import { clip, severityRank, sortFindings, trimFinding, type TrimmedFinding } from '../format.js';

export type AgentFinding = TrimmedFinding & { agent?: string };

export interface Collected {
  findings: AgentFinding[];
  dismissed: number;
}

export const agentLabel = (r: ReviewLite): string => r.agent_name ?? r.agent_id ?? 'unknown';

/** Flattens reviews into sorted, trimmed, non-dismissed findings (dismissed are counted). */
export function collectFindings(reviews: readonly ReviewLite[], minSeverity?: Severity): Collected {
  let dismissed = 0;
  const flat: (TrimmedFinding & { agent: string })[] = [];
  for (const r of reviews) {
    for (const f of r.findings) {
      if (f.dismissed_at) {
        dismissed++;
        continue;
      }
      if (minSeverity && severityRank(f.severity) > severityRank(minSeverity)) continue;
      flat.push({ ...trimFinding(f), agent: agentLabel(r) });
    }
  }
  const single = new Set(reviews.map(agentLabel)).size <= 1;
  const sorted = sortFindings(flat).map((f) => {
    if (!single) return f;
    const { agent: _agent, ...rest } = f;
    return rest;
  });
  return { findings: sorted, dismissed };
}

export function reviewHeader(r: ReviewLite, summaryClip?: number) {
  const out: Record<string, unknown> = { agent: agentLabel(r) };
  if (r.verdict) out.verdict = r.verdict;
  if (r.score != null) out.score = r.score;
  if (summaryClip && r.summary) out.summary = clip(r.summary, summaryClip);
  return out;
}
