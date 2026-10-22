export interface DigestFinding {
  id: string;
  file: string;
  severity: string;
  category: string;
  title: string;
  rationale: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

export interface DigestEntry {
  severity: string;
  total: number;
  accepted: number;
  topTitles: string[];
}

export interface FindingDigest {
  prId: string;
  entries: DigestEntry[];
  preview: string | null;
}

export const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export function groupBySeverity(findings: DigestFinding[], topN: number): DigestEntry[] {
  const bySeverity = new Map<string, DigestFinding[]>();
  for (const f of findings) {
    const list = bySeverity.get(f.severity) ?? [];
    list.push(f);
    bySeverity.set(f.severity, list);
  }
  return [...bySeverity.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([severity, list]) => ({
      severity,
      total: list.length,
      accepted: list.filter((f) => f.acceptedAt !== null).length,
      topTitles: list.slice(0, topN).map((f) => f.title),
    }));
}

function rank(severity: string): number {
  const i = SEVERITY_ORDER.indexOf(severity as (typeof SEVERITY_ORDER)[number]);
  return i === -1 ? SEVERITY_ORDER.length : i;
}
