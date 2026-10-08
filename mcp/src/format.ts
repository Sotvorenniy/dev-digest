import type { FindingLite, ReviewLite, Severity } from './api/schemas.js';
import { MAX_RESULT_CHARS, TEXT_CLIP } from './constants.js';
import { ToolError } from './errors.js';

const FILE_CLIP = 300;

/** Collapses whitespace and clips to n chars, appending an ellipsis. */
export function clip(text: string | null | undefined, n: number): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export interface TrimmedFinding {
  id: string;
  severity: Severity;
  file: string;
  start_line: number;
  end_line: number;
  category?: string;
  title: string;
  confidence?: number;
  rationale?: string;
}

/** Drops `suggestion`, dismissal state and everything else not needed to act. */
export function trimFinding(f: FindingLite): TrimmedFinding {
  const out: TrimmedFinding = {
    id: f.id,
    severity: f.severity,
    file: clip(f.file, FILE_CLIP),
    start_line: f.start_line,
    end_line: f.end_line,
    title: clip(f.title, TEXT_CLIP),
  };
  if (f.category) out.category = f.category;
  if (f.confidence != null) out.confidence = Math.round(f.confidence * 100) / 100;
  const r = clip(f.rationale, TEXT_CLIP);
  if (r) out.rationale = r;
  return out;
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
export const severityRank = (s: Severity): number => SEVERITY_RANK[s];

/** Severity (CRITICAL first), then file, then line. Does not mutate. */
export function sortFindings<T extends { severity: Severity; file: string; start_line: number }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.file.localeCompare(b.file) ||
      a.start_line - b.start_line,
  );
}

/** Newest review per agent_id; each review with a null agent_id is its own bucket. */
export function latestReviewPerAgent(reviews: readonly ReviewLite[]): ReviewLite[] {
  const best = new Map<string, ReviewLite>();
  for (const r of reviews) {
    const key = r.agent_id ? `agent:${r.agent_id}` : `review:${r.id}`;
    const cur = best.get(key);
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) best.set(key, r);
  }
  return [...best.values()];
}

export interface Page<T> {
  items: T[];
  truncated: boolean;
  next_cursor?: string;
}

/** Clips every top-level string value of an object; other values are returned as is. */
function shrinkStrings<T>(item: T, n: number): T {
  if (typeof item === 'string') return clip(item, n) as unknown as T;
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) out[k] = typeof v === 'string' ? clip(v, n) : v;
  return out as T;
}

/** Cursor is a decimal offset. Stops at pageSize or maxChars of serialized items. */
export function paginate<T>(
  items: readonly T[],
  cursor: string | undefined,
  pageSize: number,
  maxChars: number = MAX_RESULT_CHARS,
): Page<T> {
  let offset = 0;
  if (cursor !== undefined && cursor !== '') {
    if (!/^\d{1,7}$/.test(cursor) || Number(cursor) > items.length) {
      throw new ToolError('invalid cursor; omit cursor to start over');
    }
    offset = Number(cursor);
  }
  const out: T[] = [];
  let chars = 0;
  for (let i = offset; i < items.length && out.length < pageSize; i++) {
    const item = items[i] as T;
    let len = JSON.stringify(item).length + 1;
    if (out.length > 0 && chars + len > maxChars) break;
    let kept = item;
    if (out.length === 0 && len > maxChars) {
      // An oversized first item must not bypass the cap: clip it, never return an empty page.
      kept = shrinkStrings(item, TEXT_CLIP);
      len = JSON.stringify(kept).length + 1;
    }
    out.push(kept);
    chars += len;
  }
  const end = offset + out.length;
  const truncated = end < items.length;
  return truncated ? { items: out, truncated, next_cursor: String(end) } : { items: out, truncated };
}

/** Removes undefined, null, empty-string and empty-array keys (not 0/false). */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}
