import type { ProjectContextDoc } from "@/lib/types";

/** One picker row: a real doc, or an attached path that no longer exists. */
export interface PickerRow {
  path: string;
  type: string | null;
  tokens: number | null;
  missing: boolean;
}

/** Docs first (list order), then attached-but-missing paths (EC4). */
export function buildRows(docs: ProjectContextDoc[], attached: string[], missing: string[]): PickerRow[] {
  const known = new Set(docs.map((d) => d.path));
  const rows: PickerRow[] = docs.map((d) => ({ path: d.path, type: d.type, tokens: d.tokens, missing: false }));
  const missingSet = new Set(missing);
  for (const p of attached) {
    if (!known.has(p) && missingSet.has(p)) rows.push({ path: p, type: null, tokens: null, missing: true });
  }
  return rows;
}

export function filterRows(rows: PickerRow[], filter: string): PickerRow[] {
  const q = filter.trim().toLowerCase();
  return q ? rows.filter((r) => r.path.toLowerCase().includes(q)) : rows;
}

/** Token sum over attached docs that are present in `docs` (missing ones cost 0). */
export function sumAttachedTokens(docs: ProjectContextDoc[], attached: string[]): number {
  const set = new Set(attached);
  return docs.reduce((sum, d) => (set.has(d.path) ? sum + d.tokens : sum), 0);
}

/** Append to / remove from the attach order; returns the full next list. */
export function toggleAttached(attached: string[], path: string): string[] {
  return attached.includes(path) ? attached.filter((p) => p !== path) : [...attached, path];
}

/** Moves `from` to the slot of `to` in the attach order; unknown paths → unchanged list. */
export function movePath(attached: string[], from: string, to: string): string[] {
  const i = attached.indexOf(from);
  const j = attached.indexOf(to);
  if (i === -1 || j === -1 || i === j) return attached;
  const next = attached.filter((p) => p !== from);
  next.splice(j, 0, from);
  return next;
}

/** Moves `path` one step up (-1) or down (+1); clamped at both ends. */
export function moveBy(attached: string[], path: string, delta: -1 | 1): string[] {
  const i = attached.indexOf(path);
  const target = attached[i + delta];
  return i === -1 || target === undefined ? attached : movePath(attached, path, target);
}
