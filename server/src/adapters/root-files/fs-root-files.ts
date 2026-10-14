import { readdir, readFile as fsReadFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import {
  ROOT_COMPOSE_RE,
  ROOT_ENV_EXAMPLE,
  ROOT_FILE_MAX_BYTES,
  ROOT_LOCKFILES,
  ROOT_MAKEFILE,
  ROOT_PACKAGE_JSON,
  ROOT_README_RE,
  type RootFilesPort,
  type RootFilesSnapshot,
} from '../../ports/root-files.js';

export interface FsRootFilesOptions {
  clonePathFor: (repo: RepoRef) => string;
  /** Test seam: every content read goes through this. */
  readFile?: (path: string) => Promise<Buffer>;
}

const LOCKFILES = new Set<string>(ROOT_LOCKFILES);

/**
 * Reads allowlisted files from the clone root only. One non-recursive `readdir`;
 * only names from the fixed allowlist are ever joined to the root, symlinks are
 * skipped, and `.env.example` / lockfiles are never opened.
 */
export class FsRootFiles implements RootFilesPort {
  private readonly readBuf: (path: string) => Promise<Buffer>;

  constructor(private readonly opts: FsRootFilesOptions) {
    this.readBuf = opts.readFile ?? ((p) => fsReadFile(p));
  }

  async read(repo: RepoRef): Promise<RootFilesSnapshot | null> {
    let root: string;
    try {
      root = resolve(this.opts.clonePathFor(repo));
      if (!(await stat(root)).isDirectory()) return null;
    } catch {
      return null;
    }

    let entries: Dirent[];
    try {
      entries = (await readdir(root, { withFileTypes: true })) as Dirent[];
    } catch {
      return null;
    }

    const files = entries
      .filter((e) => !e.isSymbolicLink() && e.isFile())
      .map((e) => e.name)
      .sort();

    const snap: RootFilesSnapshot = {
      packageJson: null,
      makefile: null,
      composeFiles: [],
      readme: null,
      lockfiles: [],
      hasEnvExample: false,
      skipped: [],
    };

    const readmes: string[] = [];
    for (const name of files) {
      if (LOCKFILES.has(name)) snap.lockfiles.push(name);
      else if (name === ROOT_ENV_EXAMPLE) snap.hasEnvExample = true;
      else if (ROOT_README_RE.test(name)) readmes.push(name);
    }

    for (const name of files) {
      if (name === ROOT_PACKAGE_JSON) {
        snap.packageJson = await this.readText(root, name, snap);
      } else if (name === ROOT_MAKEFILE) {
        snap.makefile = await this.readText(root, name, snap);
      } else if (ROOT_COMPOSE_RE.test(name)) {
        const text = await this.readText(root, name, snap);
        if (text !== null) snap.composeFiles.push({ name, text });
      }
    }

    const readmeName =
      readmes.find((n) => n.toLowerCase() === 'readme.md') ?? readmes[0] ?? null;
    if (readmeName) {
      const text = await this.readText(root, readmeName, snap);
      if (text !== null) snap.readme = { name: readmeName, text };
    }

    return snap;
  }

  /** `name` is always an allowlisted entry name from `readdir` — never repo/model input. */
  private async readText(
    root: string,
    name: string,
    snap: RootFilesSnapshot,
  ): Promise<string | null> {
    const full = join(root, name);
    try {
      const st = await stat(full);
      if (!st.isFile()) return null;
      if (st.size > ROOT_FILE_MAX_BYTES) {
        snap.skipped.push({ name, reason: 'too_large' });
        return null;
      }
      const buf = await this.readBuf(full);
      if (buf.length > ROOT_FILE_MAX_BYTES) {
        snap.skipped.push({ name, reason: 'too_large' });
        return null;
      }
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        snap.skipped.push({ name, reason: 'not_utf8' });
        return null;
      }
    } catch {
      return null;
    }
  }
}
