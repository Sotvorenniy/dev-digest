// Shared helpers for pr-self-review. No dependencies — Node 20 built-ins only.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

export function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: opts.cwd ?? repoRoot(),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'pipe'],
  });
}

let root;
export function repoRoot() {
  root ??= execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: SKILL_DIR,
    encoding: 'utf8',
  }).trim();
  return root;
}

export const CACHE_DIR = () => join(repoRoot(), '.devdigest', 'cache', 'pr-self-review');
export const VERDICT_FILE = () => join(repoRoot(), '.devdigest', 'cache', 'self-review.json');

/** Base the PR will be opened against: merge-base with origin/main (falls back to main). */
export function resolveBase() {
  const env = process.env.PR_SELF_REVIEW_BASE;
  for (const ref of [env, 'origin/main', 'main'].filter(Boolean)) {
    try {
      return { ref, sha: git(['merge-base', ref, 'HEAD'], { quiet: true }).trim() };
    } catch {
      /* try next */
    }
  }
  throw new Error('pr-self-review: cannot resolve a base (no origin/main or main)');
}

/**
 * Every local change relative to the base: commits base..HEAD + staged + unstaged
 * + untracked. Statuses: A (added), M (modified), D (deleted), U (untracked = new).
 */
export function collect() {
  const base = resolveBase();
  const head = git(['rev-parse', 'HEAD']).trim();

  const files = new Map();
  const nameStatus = git(['diff', '--no-renames', '--name-status', base.sha]);
  for (const line of nameStatus.split('\n').filter(Boolean)) {
    const [status, path] = line.split('\t');
    files.set(path, status[0]);
  }
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  for (const path of untracked.split('\n').filter(Boolean)) files.set(path, 'U');

  const dirty = git(['status', '--porcelain']).trim().length > 0;

  // Content hash, invariant to commit state: reviewing, then committing the same
  // content must not invalidate the verdict — changing any byte must.
  const h = createHash('sha256');
  h.update(`base:${base.sha}\n`);
  const sorted = [...files.keys()].sort();
  for (const path of sorted) {
    h.update(`${path}\0`);
    h.update(fileFingerprint(join(repoRoot(), path)));
    h.update('\0');
  }

  return {
    base: base.sha,
    base_ref: base.ref,
    head,
    dirty,
    diff_hash: h.digest('hex'),
    files: sorted.map((path) => ({ path, status: files.get(path) })),
  };
}

/** Bytes that identify a path's current state. A symlink hashes as its target, never followed. */
function fileFingerprint(abs) {
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    return Buffer.from('\0deleted');
  }
  if (st.isSymbolicLink()) return Buffer.from(`\0symlink:${readlinkSync(abs)}`);
  if (!st.isFile()) return Buffer.from('\0not-a-file');
  return readFileSync(abs);
}

/** Added lines per file (for content triggers). Untracked files count as fully added. */
export function addedLines(snapshot) {
  const out = {};
  const diff = git(['diff', '--no-renames', '-U0', '--no-color', snapshot.base]);
  let current = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      current = line === '+++ /dev/null' ? null : line.slice(6);
      if (current) out[current] ??= [];
    } else if (current && line.startsWith('+') && !line.startsWith('+++')) {
      out[current].push(line.slice(1));
    }
  }
  for (const f of snapshot.files.filter((f) => f.status === 'U')) {
    try {
      out[f.path] = readFileSync(join(repoRoot(), f.path), 'utf8').split('\n');
    } catch {
      out[f.path] = [];
    }
  }
  return out;
}

/** Minimal glob → RegExp: `**`, `*`, `?`, `{a,b}`. Paths are repo-relative, `/`-separated. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const slash = glob[i + 2] === '/';
        re += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      const alts = glob.slice(i + 1, end).split(',').map((a) => a.replace(/[.+^$()|[\]\\]/g, '\\$&'));
      re += `(?:${alts.join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const matchesAny = (path, globs = []) => globs.some((g) => globToRegExp(g).test(path));

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}
