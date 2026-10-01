import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { MergedCandidate } from '@devdigest/reviewer-core';
import type { NewConventionRow } from './ports.js';
import {
  CONFIG_SAMPLE_FILENAMES,
  CONFIG_SAMPLE_MAX_CHARS,
  CONFIG_SAMPLE_MAX_FILES,
  LINT_CONFIG_FILENAMES,
} from './constants.js';

// -----------------------------------------------------------------------------
// Pipeline transforms (pure — no DB/FS row types; those stay in repository.ts)
// -----------------------------------------------------------------------------

/**
 * Map a grounded `MergedCandidate` (via its `displayEvidence`) plus its
 * computed final confidence into an insertable row. The verdict/floor
 * filtering already happened in the service before this is called — this is
 * a pure shape transform, not a gate.
 */
export function mergedCandidateToRow(
  candidate: MergedCandidate,
  confidence: number,
  workspaceId: string,
  repoId: string,
): NewConventionRow {
  const ev = candidate.displayEvidence;
  return {
    workspaceId,
    repoId,
    rule: candidate.rule,
    evidencePath: ev.path,
    evidenceSnippet: ev.snippet,
    evidenceStartLine: ev.startLine ?? null,
    evidenceEndLine: ev.endLine ?? null,
    confidence,
    category: candidate.category ?? null,
    status: 'pending',
  };
}

// -----------------------------------------------------------------------------
// Sample diversification
// -----------------------------------------------------------------------------

/** `dir-bucket|ext` — top-2-level directory + extension, the round-robin grouping key. */
function bucketKey(path: string): string {
  const parts = path.split('/');
  const dir = parts.length > 1 ? parts.slice(0, 2).join('/') : '(root)';
  const ext = extname(path) || '(none)';
  return `${dir}|${ext}`;
}

/**
 * Backfill up to `targetN` more file paths from `pool` (a ranked list NOT
 * already in `alreadySelected`), round-robin by top-2-level directory /
 * extension bucket, preferring buckets `alreadySelected` doesn't already
 * represent. Deterministic and pure — no repo-intel call here; the caller
 * over-fetches `repoIntel.getConventionSamples(repoId, N)` with a larger N
 * once and passes the tail as `pool` (repo-intel doesn't separately expose
 * "give me the full ranked list" — `getConventionSamples`/`getTopFilesByRank`
 * both already do the ranking + junk-filtering, so over-fetching from the
 * SAME method and diversifying over the tail here avoids adding a new
 * repo-intel method for a single caller).
 */
export function diversifySamples(
  pool: string[],
  alreadySelected: string[],
  targetN: number,
): string[] {
  if (targetN <= 0) return [];
  const selectedSet = new Set(alreadySelected);
  const representedBuckets = new Set(alreadySelected.map(bucketKey));
  const candidates = pool.filter((p) => !selectedSet.has(p));

  const byBucket = new Map<string, string[]>();
  for (const p of candidates) {
    const key = bucketKey(p);
    const arr = byBucket.get(key);
    if (arr) arr.push(p);
    else byBucket.set(key, [p]);
  }

  const bucketKeys = [...byBucket.keys()];
  const orderedKeys = [
    ...bucketKeys.filter((k) => !representedBuckets.has(k)),
    ...bucketKeys.filter((k) => representedBuckets.has(k)),
  ];

  const out: string[] = [];
  let progress = true;
  while (out.length < targetN && progress) {
    progress = false;
    for (const key of orderedKeys) {
      if (out.length >= targetN) break;
      const arr = byBucket.get(key);
      if (arr && arr.length > 0) {
        out.push(arr.shift()!);
        progress = true;
      }
    }
  }

  return out;
}

// -----------------------------------------------------------------------------
// Lint/formatter detection
// -----------------------------------------------------------------------------

const LINT_SCAN_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  'vendor',
]);

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check the repo root, and one level down, for lint/formatter config files.
 * Returns a one-line trusted note (server-derived, not repo content) to feed
 * `ConventionScanPromptParts.lintConfigNote`, or `undefined` when nothing was
 * found (the note is then omitted entirely — same "empty slot" convention as
 * `assemblePrompt`'s optional sections).
 */
export async function detectLintConfig(clonePath: string): Promise<string | undefined> {
  const found = new Set<string>();

  async function checkDir(dir: string, label: string): Promise<void> {
    for (const filename of LINT_CONFIG_FILENAMES) {
      if (await fileExists(join(dir, filename))) {
        found.add(label ? `${label}/${filename}` : filename);
      }
    }
  }

  await checkDir(clonePath, '');

  try {
    const entries = await readdir(clonePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (LINT_SCAN_SKIP_DIRS.has(entry.name)) continue;
      await checkDir(join(clonePath, entry.name), entry.name);
    }
  } catch {
    // clone missing / unreadable — no lint config detected, note stays undefined.
  }

  if (found.size === 0) return undefined;
  return `This repo has lint/format config detected: ${[...found].sort().join(', ')}.`;
}

// -----------------------------------------------------------------------------
// Clone file reads
// -----------------------------------------------------------------------------

/** Read one file from a repo's clone. `null` on any error (missing file, bad path). */
export async function readCloneFile(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}

/**
 * Read the repo's root-level config files (eslint/prettier/tsconfig/
 * editorconfig/biome) as sample files, capped in count and size. Missing
 * files are skipped. Excludes any path already in `alreadySampled`.
 */
export async function readConfigSamples(
  clonePath: string,
  alreadySampled: string[] = [],
): Promise<{ path: string; content: string }[]> {
  const skip = new Set(alreadySampled);
  const out: { path: string; content: string }[] = [];
  for (const name of CONFIG_SAMPLE_FILENAMES) {
    if (out.length >= CONFIG_SAMPLE_MAX_FILES) break;
    if (skip.has(name)) continue;
    const content = await readCloneFile(clonePath, name);
    if (content != null && content.trim().length > 0) {
      out.push({ path: name, content: content.slice(0, CONFIG_SAMPLE_MAX_CHARS) });
    }
  }
  return out;
}
