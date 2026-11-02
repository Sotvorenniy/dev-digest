export interface ExportableFinding {
  id: string;
  severity: string;
  category: string;
  file: string;
  startLine: number;
  title: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

export type FindingStatus = 'accepted' | 'dismissed' | 'open';

export function statusOf(f: ExportableFinding): FindingStatus {
  if (f.acceptedAt) return 'accepted';
  if (f.dismissedAt) return 'dismissed';
  return 'open';
}
