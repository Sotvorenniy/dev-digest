import { createTwoFilesPatch } from "diff";
import type { SkillVersion } from "@devdigest/shared";

/** The row with the highest version number — "current" isn't a flag on the
 *  row, it's whichever version number is largest. */
export function currentVersionOf(versions: SkillVersion[]): SkillVersion | null {
  if (versions.length === 0) return null;
  return versions.reduce((a, b) => (b.version > a.version ? b : a));
}

export function sortedByVersionDesc(versions: SkillVersion[]): SkillVersion[] {
  return [...versions].sort((a, b) => b.version - a.version);
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export interface ComputedDiff {
  patch: string;
  additions: number;
  deletions: number;
}

/** Unified diff between a past version's body and the current version's body.
 *  `createTwoFilesPatch` emits `---`/`+++` file-header lines ahead of the
 *  first `@@` hunk; DiffViewer's parsePatch treats ANY line starting with
 *  +/- as a content line (it expects real diff-viewer patches, not
 *  GitHub-style file headers), so those two lines are stripped before it
 *  ever sees the text. */
export function diffAgainstCurrent(
  oldLabel: string,
  newLabel: string,
  oldBody: string,
  newBody: string,
): ComputedDiff {
  const full = createTwoFilesPatch(oldLabel, newLabel, oldBody, newBody, "", "");
  const hunkStart = full.indexOf("\n@@");
  const patch = hunkStart === -1 ? "" : full.slice(hunkStart + 1);
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { patch, additions, deletions };
}
