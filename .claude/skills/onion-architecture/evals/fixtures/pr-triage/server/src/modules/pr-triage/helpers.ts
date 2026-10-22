import { INTENT_TIMEOUT_MS } from '../intent/types.js';
import type { TriageItem } from './domain.js';

export const INTENT_BUDGET_MS = Math.floor(INTENT_TIMEOUT_MS / 3);

export function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export function toTriageDto(item: TriageItem) {
  return {
    pr_id: item.prId,
    number: item.number,
    title: item.title,
    priority: item.priority,
    reasons: item.reasons,
    intent_confidence: item.intentConfidence,
  };
}
