import type { FindingPreview } from '@devdigest/shared';
import { PREVIEW_RATIONALE_CHARS } from './constants.js';

/**
 * Pulls-module helpers (pure — no DB / `this`, so they unit-test cleanly).
 */

/** Sort weight per severity (lower = shown first). Mirrors the reviewer-core gate order. */
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** A findings row as the PR-list query selects it. */
export interface FindingPreviewRow {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  rationale: string;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/**
 * Findings of ONE review, shaped for the PR list's hover popover: worst first,
 * most-confident first within a severity, each description truncated.
 *
 * Every input row comes back. The popover counts this array to render its
 * header, so dropping rows here would print a number nothing backs up.
 */
export function buildFindingPreviews(rows: FindingPreviewRow[]): FindingPreview[] {
  return [...rows]
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
        b.confidence - a.confidence,
    )
    .map((r) => ({
      id: r.id,
      severity: r.severity as FindingPreview['severity'],
      category: r.category as FindingPreview['category'],
      title: r.title,
      file: r.file,
      start_line: r.startLine,
      end_line: r.endLine,
      confidence: r.confidence,
      rationale: truncate(r.rationale, PREVIEW_RATIONALE_CHARS),
    }));
}
