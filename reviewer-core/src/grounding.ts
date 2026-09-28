import type { Finding, UnifiedDiff } from '@devdigest/shared';

/**
 * Citation grounding — the mandatory mechanical gate for diff-findings.
 *
 * A diff-finding is kept ONLY if its [start_line, end_line] range intersects a
 * real hunk in the unified diff for the same file. Findings that fail are
 * dropped (the model "hallucinated" a location).
 *
 * EXCEPTION: findings from full-file scanners (hooks / blast / onboarding) are
 * not tied to a diff hunk — they ground against the file existing in the diff
 * (or are exempted entirely). We treat `kind` in {secret_leak, lethal_trifecta,
 * phantom, hook} as full-file: they only require the file to be present.
 */

const FULL_FILE_KINDS = new Set(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);

/**
 * Widest [start_line, end_line] a diff-finding may claim before the gate stops
 * believing it is a citation.
 *
 * The gate's job is to prove the model cited a *real* location, but a range wide
 * enough to blanket the file proves nothing — `1..1000000` intersects every hunk
 * and sails through, which is exactly the hallucinated-location case the gate
 * exists to catch. The contract types both ends as a bare int (no bound), so the
 * limit lives here. 200 lines is far beyond any genuine finding; the widest in
 * the suites is 8.
 */
const MAX_FINDING_LINE_SPAN = 200;

export interface GroundingResult {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
}

/** Build a quick lookup of file → set of new-side line numbers covered by hunks. */
export function buildLineIndex(diff: UnifiedDiff): Map<string, Set<number>> {
  const idx = new Map<string, Set<number>>();
  for (const f of diff.files) {
    const set = new Set<number>();
    for (const h of f.hunks) {
      if (h.newLineNumbers && h.newLineNumbers.length > 0) {
        for (const n of h.newLineNumbers) set.add(n);
      } else {
        // fall back to the hunk's declared new range
        for (let n = h.newStart; n < h.newStart + Math.max(h.newLines, 1); n++) set.add(n);
      }
    }
    idx.set(f.path, set);
  }
  return idx;
}

/**
 * Does [start, end] touch any line the diff covers?
 *
 * Iterates the *covered* lines (bounded by the diff) rather than the claimed
 * range (unbounded, model-supplied). The previous form walked `lo..hi` one
 * integer at a time, so a finding claiming `1000000000..2000000000` burned ~16s
 * of synchronous CPU — and this runs in-process in the API, so a single erratic
 * model response stalled every other request. Cost is now O(covered lines)
 * regardless of what the model claims.
 */
function rangeIntersects(lines: Set<number>, start: number, end: number): boolean {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (const n of lines) if (n >= lo && n <= hi) return true;
  return false;
}

/**
 * Apply the grounding gate to a set of findings against a unified diff.
 * Returns the kept findings and the dropped ones with reasons (for the trace).
 */
export function groundFindings(findings: Finding[], diff: UnifiedDiff): GroundingResult {
  const lineIndex = buildLineIndex(diff);
  const filesInDiff = new Set(diff.files.map((f) => f.path));
  const kept: Finding[] = [];
  const dropped: { finding: Finding; reason: string }[] = [];

  for (const finding of findings) {
    const isFullFile = finding.kind ? FULL_FILE_KINDS.has(finding.kind) : false;

    if (!filesInDiff.has(finding.file)) {
      dropped.push({ finding, reason: `file '${finding.file}' not present in diff` });
      continue;
    }

    if (isFullFile) {
      // full-file scanners only need the file to be in the diff
      kept.push(finding);
      continue;
    }

    // A citation has to be specific to be a citation. Reject a nonsensical or
    // file-blanketing range before testing intersection, so "be vague enough"
    // stops being a way through the gate.
    const lo = Math.min(finding.start_line, finding.end_line);
    const hi = Math.max(finding.start_line, finding.end_line);
    if (lo < 1) {
      dropped.push({
        finding,
        reason: `lines ${finding.start_line}-${finding.end_line} are not a valid 1-based range in '${finding.file}'`,
      });
      continue;
    }
    if (hi - lo + 1 > MAX_FINDING_LINE_SPAN) {
      dropped.push({
        finding,
        reason: `lines ${finding.start_line}-${finding.end_line} span ${hi - lo + 1} lines, over the ${MAX_FINDING_LINE_SPAN}-line limit for a citation in '${finding.file}'`,
      });
      continue;
    }

    const lines = lineIndex.get(finding.file) ?? new Set<number>();
    if (rangeIntersects(lines, finding.start_line, finding.end_line)) {
      kept.push(finding);
    } else {
      dropped.push({
        finding,
        reason: `lines ${finding.start_line}-${finding.end_line} do not intersect any diff hunk in '${finding.file}'`,
      });
    }
  }

  return { kept, dropped };
}

/** Human-readable summary, e.g. "3/3 passed" used in run-trace stats. */
export function groundingSummary(result: GroundingResult): string {
  const total = result.kept.length + result.dropped.length;
  return `${result.kept.length}/${total} passed`;
}
