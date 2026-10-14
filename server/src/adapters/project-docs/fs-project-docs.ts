import { readdir, readFile as fsReadFile, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import {
  CONTEXT_DOC_MAX_BYTES,
  CONTEXT_LIST_MAX_DOCS,
  checkContextPathSyntax,
  docTypeFor,
  estimateTokens,
  matchesRoots,
  type DocExists,
  type DocRead,
  type ProjectDocsPort,
  type ScannedDoc,
} from '../../ports/project-docs.js';

export interface FsProjectDocsOptions {
  clonePathFor: (repo: RepoRef) => string;
  roots: readonly string[];
  excludedDirs: readonly string[];
  /** Upper bound on directory entries visited by `list`. */
  maxVisitedFiles: number;
  /** Test seam: every content read goes through this. */
  readFile?: (path: string) => Promise<Buffer>;
}

type Resolved =
  | { kind: 'ok'; real: string; rel: string }
  | { kind: 'invalid' | 'missing' | 'clone_unavailable' };

/**
 * Reads project docs straight from a repo clone. Never follows symlinks while
 * walking; for a direct read it resolves real paths and requires the target to
 * stay inside the real clone root AND still match the search roots (so a symlink
 * to `src/secret.md` is rejected). Fails closed on every check.
 */
export class FsProjectDocs implements ProjectDocsPort {
  readonly roots: readonly string[];
  private readonly excluded: Set<string>;
  private readonly readBuf: (path: string) => Promise<Buffer>;

  constructor(private readonly opts: FsProjectDocsOptions) {
    this.roots = opts.roots;
    this.excluded = new Set(opts.excludedDirs);
    this.readBuf = opts.readFile ?? ((p) => fsReadFile(p));
  }

  private cloneRoot(repo: RepoRef): string | null {
    try {
      return resolve(this.opts.clonePathFor(repo));
    } catch {
      return null;
    }
  }

  async list(repo: RepoRef) {
    const root = this.cloneRoot(repo);
    if (!root) return { kind: 'clone_unavailable' as const };
    try {
      if (!(await stat(root)).isDirectory()) return { kind: 'clone_unavailable' as const };
    } catch {
      return { kind: 'clone_unavailable' as const };
    }

    const found: { rel: string; full: string }[] = [];
    const budget = { left: this.opts.maxVisitedFiles };
    await this.walk(root, root, found, budget);
    found.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

    const truncated = found.length > CONTEXT_LIST_MAX_DOCS;
    const kept = found.slice(0, CONTEXT_LIST_MAX_DOCS);
    const docs: ScannedDoc[] = [];
    for (const f of kept) {
      try {
        const st = await stat(f.full);
        const tokens =
          st.size > CONTEXT_DOC_MAX_BYTES
            ? Math.ceil(st.size / 4)
            : estimateTokens((await this.readBuf(f.full)).toString('utf8'));
        docs.push({
          path: f.rel,
          type: docTypeFor(f.rel, this.roots),
          sizeBytes: st.size,
          tokens,
          updatedAt: st.mtime.toISOString(),
        });
      } catch {
        // Vanished or unreadable between walk and stat — skip it.
      }
    }
    return { kind: 'ok' as const, docs, truncated };
  }

  private async walk(
    root: string,
    dir: string,
    out: { rel: string; full: string }[],
    budget: { left: number },
  ): Promise<void> {
    let entries: Dirent[];
    try {
      entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      if (budget.left <= 0) return;
      if (entry.isSymbolicLink()) continue; // never follow symlinks
      if (entry.isDirectory()) {
        if (this.excluded.has(entry.name)) continue;
        await this.walk(root, join(dir, entry.name), out, budget);
        continue;
      }
      if (!entry.isFile()) continue;
      budget.left -= 1;
      if (!entry.name.endsWith('.md')) continue;
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join('/');
      if (!checkContextPathSyntax(rel) || !matchesRoots(rel, this.roots)) continue;
      out.push({ rel, full });
    }
  }

  /** Steps 1-4 of a read: syntax, realpath, containment, roots/excluded/.md on the resolved path. */
  private async resolveDoc(repo: RepoRef, path: string): Promise<Resolved> {
    if (!checkContextPathSyntax(path)) return { kind: 'invalid' };
    const root = this.cloneRoot(repo);
    if (!root) return { kind: 'clone_unavailable' };

    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch {
      return { kind: 'clone_unavailable' };
    }

    const lexical = resolve(realRoot, path);
    if (!lexical.startsWith(realRoot + sep)) return { kind: 'invalid' };

    let realTarget: string;
    try {
      realTarget = await realpath(lexical);
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR'
        ? { kind: 'missing' }
        : { kind: 'invalid' };
    }
    if (!realTarget.startsWith(realRoot + sep)) return { kind: 'invalid' };

    const rel = relative(realRoot, realTarget).split(sep).join('/');
    if (
      !checkContextPathSyntax(rel) ||
      !rel.endsWith('.md') ||
      !matchesRoots(rel, this.roots) ||
      rel.split('/').slice(0, -1).some((seg) => this.excluded.has(seg))
    ) {
      return { kind: 'invalid' };
    }
    return { kind: 'ok', real: realTarget, rel };
  }

  async exists(repo: RepoRef, path: string): Promise<DocExists> {
    const r = await this.resolveDoc(repo, path);
    return r.kind;
  }

  async read(repo: RepoRef, path: string): Promise<DocRead> {
    const r = await this.resolveDoc(repo, path);
    if (r.kind !== 'ok') return { kind: r.kind };

    let st;
    try {
      st = await stat(r.real);
    } catch {
      return { kind: 'missing' };
    }
    if (!st.isFile()) return { kind: 'invalid' };
    if (st.size > CONTEXT_DOC_MAX_BYTES) return { kind: 'too_large' };

    let buf: Buffer;
    try {
      buf = await this.readBuf(r.real);
    } catch {
      return { kind: 'missing' };
    }
    if (buf.length > CONTEXT_DOC_MAX_BYTES) return { kind: 'too_large' };
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return { kind: 'ok', text, sizeBytes: st.size, updatedAt: st.mtime.toISOString() };
    } catch {
      return { kind: 'not_utf8' };
    }
  }
}
