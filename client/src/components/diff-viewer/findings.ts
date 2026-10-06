/* Inline-finding support for the DiffViewer (Files changed tab). Opt-in: when no
   `findings` prop is passed nothing here runs. Pure helpers + the API shape. */
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { lineKey } from "./comments";

/** What the viewer needs to render current findings inline. */
export interface DiffFindingApi {
  /** Current findings keyed by file path. */
  byPath: Map<string, FindingRecord[]>;
  onAction: (finding: FindingRecord, action: FindingActionKind) => void;
  /** Finding id whose accept/dismiss is in flight. */
  pendingId?: string | null;
}

/** `RIGHT:<start_line>` — the key a finding anchors on (same space as comment threads). */
export function findingKey(f: Pick<FindingRecord, "start_line">): string | null {
  return lineKey("RIGHT", f.start_line);
}

/** Split a file's findings into ones anchored to a rendered line and the rest. */
export function partitionFindings(
  fileFindings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of fileFindings) {
    const key = findingKey(f);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  return { matched, unanchored };
}

const RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** The most severe severity among findings (unknown severities rank last), or null if none. */
export function worstSeverity(fs: Pick<FindingRecord, "severity">[]): string | null {
  let worst: string | null = null;
  for (const f of fs) {
    if (worst === null || (RANK[f.severity] ?? 9) < (RANK[worst] ?? 9)) worst = f.severity;
  }
  return worst;
}
