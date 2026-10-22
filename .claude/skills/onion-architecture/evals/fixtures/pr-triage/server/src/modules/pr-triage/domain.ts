import { confidenceLevel, type ConfidenceLevel } from '../intent/domain.js';
import { LARGE_PR_LINES, STALE_AFTER_DAYS } from './constants.js';

export type TriagePriority = 'urgent' | 'high' | 'normal' | 'low';

export interface TriagePull {
  id: string;
  number: number;
  title: string;
  additions: number;
  deletions: number;
  openedAt: Date | null;
  status: string;
}

export interface TriageItem {
  prId: string;
  number: number;
  title: string;
  priority: TriagePriority;
  reasons: string[];
  intentConfidence: ConfidenceLevel | null;
}

export function triage(pull: TriagePull, intentConfidence: number | null, now: Date): TriageItem {
  const reasons: string[] = [];
  const size = pull.additions + pull.deletions;
  if (size >= LARGE_PR_LINES) reasons.push('large');
  const ageDays = pull.openedAt ? (now.getTime() - pull.openedAt.getTime()) / 86_400_000 : 0;
  if (ageDays >= STALE_AFTER_DAYS) reasons.push('stale');
  const level = intentConfidence === null ? null : confidenceLevel(intentConfidence);
  if (level === 'low') reasons.push('unclear-intent');

  const priority: TriagePriority =
    reasons.includes('stale') && reasons.includes('large') ? 'urgent'
    : reasons.includes('stale') ? 'high'
    : reasons.length > 0 ? 'normal'
    : 'low';
  return { prId: pull.id, number: pull.number, title: pull.title, priority, reasons, intentConfidence: level };
}

const ORDER: Record<TriagePriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function byPriority(a: TriageItem, b: TriageItem): number {
  return ORDER[a.priority] - ORDER[b.priority] || a.number - b.number;
}
