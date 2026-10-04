import type { FindingRecord, PrFile, SmartDiff, SmartDiffRole } from "@devdigest/shared";

export interface FileGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Smart-diff groups resolved to the PR's full file objects (patch included).
 * Files the server did not list (it never should) are appended to `core` so no
 * file can disappear from the review.
 */
export function groupFiles(files: PrFile[], smart: SmartDiff): FileGroup[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const placed = new Set<string>();
  const groups: FileGroup[] = [];
  for (const g of smart.groups) {
    const resolved: PrFile[] = [];
    for (const sf of g.files) {
      const f = byPath.get(sf.path);
      if (f && !placed.has(sf.path)) {
        placed.add(sf.path);
        resolved.push(f);
      }
    }
    if (resolved.length > 0) groups.push({ role: g.role, files: resolved });
  }
  const missing = files.filter((f) => !placed.has(f.path));
  if (missing.length > 0) {
    const core = groups.find((g) => g.role === "core");
    if (core) core.files.push(...missing);
    else groups.unshift({ role: "core", files: missing });
  }
  return groups;
}

/** Index findings by file path. */
export function findingsByPath(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const map = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const list = map.get(f.file) ?? [];
    list.push(f);
    map.set(f.file, list);
  }
  return map;
}

/** Number of FILES (not findings) that carry at least one finding. */
export function filesWithFindingsCount(files: PrFile[], byPath: Map<string, FindingRecord[]>): number {
  return files.filter((f) => (byPath.get(f.path)?.length ?? 0) > 0).length;
}

export function diffTotals(files: PrFile[]): { additions: number; deletions: number } {
  return files.reduce(
    (t, f) => ({ additions: t.additions + (f.additions ?? 0), deletions: t.deletions + (f.deletions ?? 0) }),
    { additions: 0, deletions: 0 },
  );
}
