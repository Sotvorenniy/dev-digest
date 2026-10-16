/**
 * ProjectDocs port — lists and reads the Markdown docs under a repo clone's
 * configured search roots (the "project context" a reviewer can be given).
 *
 * The pure path rules live here (core) so the module service and the fs adapter
 * agree on them, like `isDocUrlAllowed` in `doc-fetcher.ts`. No fs in this file.
 */
import type { RepoRef } from '@devdigest/shared';

/** Largest single doc that may be previewed or injected, in bytes. */
export const CONTEXT_DOC_MAX_BYTES = 65_536;
/** Token budget for all docs injected into one run. */
export const CONTEXT_RUN_MAX_TOKENS = 24_000;
/** Most docs returned by one list call. */
export const CONTEXT_LIST_MAX_DOCS = 500;
/** Most paths attachable to one agent/skill per repo. */
export const CONTEXT_MAX_ATTACHMENTS = 50;
/** Most directory entries the scan visits (equals repo-intel MAX_INDEXED_FILES). */
export const CONTEXT_SCAN_MAX_FILES = 5_000;

/** Rough token estimate, same convention as `platform/trace-builder.ts`. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
}

/** Converts a glob body (no anchors) to a regex source. Supports `**`, `*`, `{a,b}` only. */
function globBody(glob: string): string {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?'; // zero or more whole segments
          i += 3;
        } else {
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
      continue;
    }
    if (c === '{') {
      const close = glob.indexOf('}', i + 1);
      if (close > i) {
        const alts = glob.slice(i + 1, close).split(',').map(globBody);
        out += `(?:${alts.join('|')})`;
        i = close + 1;
        continue;
      }
    }
    out += escapeRegExpLiteral(c);
    i += 1;
  }
  return out;
}

/** Anchored RegExp for a glob. Every regex metacharacter other than the three glob forms is escaped. */
export function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${globBody(glob)}$`);
}

export function matchesRoots(path: string, roots: readonly string[]): boolean {
  return roots.some((r) => globToRegExp(r).test(path));
}

/** Literal folder names named by the roots, with `{a,b}` alternatives expanded. */
function literalFolders(roots: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const root of roots) {
    const segs = root.split('/');
    for (const seg of segs.slice(0, -1)) {
      const brace = /^\{([^{}]*)\}$/.exec(seg);
      const alts = brace ? brace[1]!.split(',') : [seg];
      for (const a of alts) {
        if (a !== '' && !/[*{}]/.test(a)) names.add(a);
      }
    }
  }
  return names;
}

/** Doc type: the folder nearest the file that a root names literally; else the first directory. */
export function docTypeFor(path: string, roots: readonly string[]): string {
  const dirs = path.split('/').slice(0, -1);
  const known = literalFolders(roots);
  for (let i = dirs.length - 1; i >= 0; i--) {
    if (known.has(dirs[i]!)) return dirs[i]!;
  }
  return dirs[0] ?? 'root';
}

/** Syntax-only check of a repo-relative `/` path. Fails closed. Never touches fs. */
export function checkContextPathSyntax(path: string): boolean {
  if (path.length === 0) return false;
  if (path.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  if (path.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(path)) return false;
  if (path.includes('%')) return false; // blocks `specs/%2e%2e/x.md`
  if (path.split('/').some((seg) => seg === '..')) return false;
  return true;
}

export interface ScannedDoc {
  path: string;
  type: string;
  sizeBytes: number;
  tokens: number;
  updatedAt: string | null;
}

export type DocRead =
  | { kind: 'ok'; text: string; sizeBytes: number; updatedAt: string | null }
  | { kind: 'invalid' | 'missing' | 'too_large' | 'not_utf8' | 'clone_unavailable' };

export type DocExists = 'ok' | 'missing' | 'invalid' | 'clone_unavailable';

export interface ProjectDocsPort {
  /** Active search roots (globs). */
  readonly roots: readonly string[];
  list(
    repo: RepoRef,
  ): Promise<{ kind: 'ok'; docs: ScannedDoc[]; truncated: boolean } | { kind: 'clone_unavailable' }>;
  /** Reads one doc; no content is read until every path check has passed. */
  read(repo: RepoRef, path: string): Promise<DocRead>;
  /** Validates and stats only; never reads content. */
  exists(repo: RepoRef, path: string): Promise<DocExists>;
}
