import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES, SMART_DIFF_ROLE_ORDER } from './constants.js';

/** Pure smart-diff rules: path -> role, and grouping. No DB, no framework. */

/** The role of one changed file. First matching rule wins; unmatched is `core`. */
export function classifyFile(path: string): SmartDiffRole {
  for (const rule of CLASSIFY_RULES) {
    if (rule.re.test(path)) return rule.role;
  }
  return 'core';
}

export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffFindingInput {
  file: string;
  startLine: number;
}

/**
 * Groups files by role in reading order (empty roles omitted, input order kept inside a group).
 * `finding_lines` are the unique, ascending start lines of the findings on that file.
 */
export function buildSmartDiff(files: SmartDiffFileInput[], findings: SmartDiffFindingInput[]): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = linesByFile.get(f.file) ?? new Set<number>();
    set.add(f.startLine);
    linesByFile.set(f.file, set);
  }

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  let totalLines = 0;
  for (const file of files) {
    totalLines += file.additions + file.deletions;
    const role = classifyFile(file.path);
    const list = byRole.get(role) ?? [];
    list.push({
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: [...(linesByFile.get(file.path) ?? [])].sort((a, b) => a - b),
    });
    byRole.set(role, list);
  }

  return {
    groups: SMART_DIFF_ROLE_ORDER.flatMap((role) => {
      const list = byRole.get(role);
      return list && list.length > 0 ? [{ role, files: list }] : [];
    }),
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
