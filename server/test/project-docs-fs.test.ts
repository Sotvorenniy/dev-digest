import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import { FsProjectDocs } from '../src/adapters/project-docs/fs-project-docs.js';
import { CONTEXT_DOC_MAX_BYTES, CONTEXT_LIST_MAX_DOCS } from '../src/ports/project-docs.js';

/**
 * SPEC-01 AC1, AC3 (read), AC5, NFR1, NFR2, NFR4, EC3, EC7, EC9, EC18.
 * Hermetic: a real tmp dir, no DB. Never imports test/helpers/pg.ts.
 */

const REPO: RepoRef = { owner: 'o', name: 'n' };
const ROOTS = ['**/{specs,docs,insights}/**/*.md'];
const EXCLUDED = ['node_modules', '.git'];

let tmp: string; // holds the clone and a sibling "outside" dir
let clone: string;
let outside: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pdocs-'));
  clone = join(tmp, 'clone');
  outside = join(tmp, 'outside');
  await mkdir(clone, { recursive: true });
  await mkdir(outside, { recursive: true });
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function put(rel: string, body: string | Buffer = '# doc\n'): Promise<void> {
  const full = join(clone, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, body);
}

function adapter(over: Partial<ConstructorParameters<typeof FsProjectDocs>[0]> = {}) {
  return new FsProjectDocs({
    clonePathFor: () => clone,
    roots: ROOTS,
    excludedDirs: EXCLUDED,
    maxVisitedFiles: 5_000,
    ...over,
  });
}

describe('FsProjectDocs.list', () => {
  it('returns exactly the three AC1 docs, sorted, with type/size/tokens', async () => {
    await put('specs/a.md', 'x'.repeat(40));
    await put('docs/b.md', 'y'.repeat(8));
    await put('insights/c.md', 'z');
    await put('src/d.md');
    await put('specs/e.txt');
    await put('README.md');

    const res = await adapter().list(REPO);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.docs.map((d) => d.path)).toEqual(['docs/b.md', 'insights/c.md', 'specs/a.md']);
    expect(res.docs.map((d) => d.type)).toEqual(['docs', 'insights', 'specs']);
    expect(res.docs.map((d) => d.tokens)).toEqual([2, 1, 10]);
    expect(res.docs[2]!.sizeBytes).toBe(40);
    expect(res.docs[0]!.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(res.truncated).toBe(false);
  });

  it('excludes node_modules even when its path matches a root', async () => {
    await put('specs/a.md');
    await put('node_modules/specs/x.md');
    const res = await adapter().list(REPO);
    if (res.kind !== 'ok') throw new Error('expected ok');
    expect(res.docs.map((d) => d.path)).toEqual(['specs/a.md']);
  });

  it('does not list symlinks (file or directory) pointing outside or into src', async () => {
    await put('specs/real.md');
    await put('src/secret.md', 'SECRET');
    await writeFile(join(outside, 'leak.md'), 'LEAK');
    await mkdir(join(outside, 'dir'), { recursive: true });
    await writeFile(join(outside, 'dir', 'in-dir.md'), 'LEAK2');
    await symlink(join(outside, 'leak.md'), join(clone, 'specs', 'out.md'));
    await symlink(join(clone, 'src', 'secret.md'), join(clone, 'specs', 'inner.md'));
    await symlink(join(outside, 'dir'), join(clone, 'docs'));

    const res = await adapter().list(REPO);
    if (res.kind !== 'ok') throw new Error('expected ok');
    expect(res.docs.map((d) => d.path)).toEqual(['specs/real.md']);
  });

  it('501 matching docs give 500 docs and truncated: true (EC9)', async () => {
    for (let i = 0; i < CONTEXT_LIST_MAX_DOCS + 1; i++) {
      await put(`docs/f${String(i).padStart(4, '0')}.md`, 'x');
    }
    const res = await adapter().list(REPO);
    if (res.kind !== 'ok') throw new Error('expected ok');
    expect(res.docs).toHaveLength(CONTEXT_LIST_MAX_DOCS);
    expect(res.truncated).toBe(true);
    expect(res.docs[0]!.path).toBe('docs/f0000.md');
  });

  it('exactly 500 docs is not truncated', async () => {
    for (let i = 0; i < CONTEXT_LIST_MAX_DOCS; i++) await put(`docs/f${i}.md`, 'x');
    const res = await adapter().list(REPO);
    if (res.kind !== 'ok') throw new Error('expected ok');
    expect(res.docs).toHaveLength(CONTEXT_LIST_MAX_DOCS);
    expect(res.truncated).toBe(false);
  });

  it('stops visiting after maxVisitedFiles entries (NFR6 bound)', async () => {
    for (let i = 0; i < 30; i++) await put(`docs/f${i}.md`, 'x');
    const res = await adapter({ maxVisitedFiles: 10 }).list(REPO);
    if (res.kind !== 'ok') throw new Error('expected ok');
    expect(res.docs.length).toBe(10);
  });

  it('lists an oversized doc (65,537 bytes) with its size; it is not read for tokens', async () => {
    await put('docs/big.md', 'a'.repeat(CONTEXT_DOC_MAX_BYTES + 1));
    const res = await adapter().list(REPO);
    if (res.kind !== 'ok') throw new Error('expected ok');
    expect(res.docs).toHaveLength(1);
    expect(res.docs[0]!.sizeBytes).toBe(CONTEXT_DOC_MAX_BYTES + 1);
  });

  it('a missing clone gives clone_unavailable (EC3)', async () => {
    const res = await adapter({ clonePathFor: () => join(tmp, 'nope') }).list(REPO);
    expect(res).toEqual({ kind: 'clone_unavailable' });
  });

  it('a clone path that is a file gives clone_unavailable', async () => {
    await writeFile(join(tmp, 'file'), 'x');
    expect(await adapter({ clonePathFor: () => join(tmp, 'file') }).list(REPO)).toEqual({
      kind: 'clone_unavailable',
    });
  });
});

describe('FsProjectDocs.read / exists', () => {
  it('reads a doc inside the clone', async () => {
    await put('specs/a.md', '# Title\nbody');
    const r = await adapter().read(REPO, 'specs/a.md');
    expect(r).toMatchObject({ kind: 'ok', text: '# Title\nbody', sizeBytes: 12 });
    expect(await adapter().exists(REPO, 'specs/a.md')).toBe('ok');
  });

  it('missing file -> missing (read and exists)', async () => {
    expect(await adapter().read(REPO, 'specs/none.md')).toEqual({ kind: 'missing' });
    expect(await adapter().exists(REPO, 'specs/none.md')).toBe('missing');
  });

  it('a 65,536-byte doc reads, a 65,537-byte doc is too_large', async () => {
    await put('docs/edge.md', 'a'.repeat(CONTEXT_DOC_MAX_BYTES));
    await put('docs/big.md', 'a'.repeat(CONTEXT_DOC_MAX_BYTES + 1));
    expect((await adapter().read(REPO, 'docs/edge.md')).kind).toBe('ok');
    expect(await adapter().read(REPO, 'docs/big.md')).toEqual({ kind: 'too_large' });
  });

  it('invalid UTF-8 gives not_utf8', async () => {
    await put('docs/bin.md', Buffer.from([0x23, 0x20, 0xff, 0xfe, 0xc3, 0x28]));
    expect(await adapter().read(REPO, 'docs/bin.md')).toEqual({ kind: 'not_utf8' });
  });

  it('a missing clone gives clone_unavailable', async () => {
    const a = adapter({ clonePathFor: () => join(tmp, 'nope') });
    expect(await a.read(REPO, 'specs/a.md')).toEqual({ kind: 'clone_unavailable' });
    expect(await a.exists(REPO, 'specs/a.md')).toBe('clone_unavailable');
  });

  it.each([
    '../outside/leak.md',
    'specs/../../outside/leak.md',
    '/etc/passwd',
    'specs/%2e%2e/x.md',
    'specs\\a.md',
    'specs/a\u0000.md',
    '',
  ])('rejects traversal/syntax fixture %j as invalid without reading', async (p) => {
    await writeFile(join(outside, 'leak.md'), 'LEAK');
    const reads: string[] = [];
    const a = adapter({
      readFile: async (path) => {
        reads.push(path);
        return readFile(path);
      },
    });
    expect(await a.read(REPO, p)).toEqual({ kind: 'invalid' });
    expect(await a.exists(REPO, p)).toBe('invalid');
    expect(reads).toEqual([]);
  });

  it('a path outside the roots / not .md / in an excluded dir is invalid, never read', async () => {
    await put('src/code.md', 'CODE');
    await put('specs/a.txt', 'TXT');
    await put('node_modules/specs/x.md', 'NM');
    const reads: string[] = [];
    const a = adapter({
      readFile: async (path) => {
        reads.push(path);
        return readFile(path);
      },
    });
    for (const p of ['src/code.md', 'specs/a.txt', 'node_modules/specs/x.md']) {
      expect(await a.read(REPO, p)).toEqual({ kind: 'invalid' });
    }
    expect(reads).toEqual([]);
  });

  it('symlinks to outside the clone or to src/secret.md are invalid and the spy sees no read of them (EC7)', async () => {
    await put('specs/real.md', 'REAL');
    await put('src/secret.md', 'SECRET');
    await writeFile(join(outside, 'leak.md'), 'LEAK');
    await symlink(join(outside, 'leak.md'), join(clone, 'specs', 'out.md'));
    await symlink(join(clone, 'src', 'secret.md'), join(clone, 'specs', 'inner.md'));
    await symlink(outside, join(clone, 'docs'));

    const reads: string[] = [];
    const a = adapter({
      readFile: async (path) => {
        reads.push(path);
        return readFile(path);
      },
    });

    expect(await a.read(REPO, 'specs/out.md')).toEqual({ kind: 'invalid' });
    expect(await a.read(REPO, 'specs/inner.md')).toEqual({ kind: 'invalid' });
    expect(await a.read(REPO, 'docs/leak.md')).toEqual({ kind: 'invalid' });
    expect(await a.exists(REPO, 'specs/out.md')).toBe('invalid');
    expect(reads).toEqual([]);

    // control: the real doc still reads, through the same spy
    expect((await a.read(REPO, 'specs/real.md')).kind).toBe('ok');
    expect(reads).toHaveLength(1);
    expect(reads[0]!.endsWith(join('clone', 'specs', 'real.md'))).toBe(true);
  });

  it('exists never reads content', async () => {
    await put('specs/a.md', 'A');
    const reads: string[] = [];
    const a = adapter({
      readFile: async (path) => {
        reads.push(path);
        return readFile(path);
      },
    });
    await a.exists(REPO, 'specs/a.md');
    expect(reads).toEqual([]);
  });
});
