/**
 * SPEC-02 root-files adapter (hermetic, tmp dir, no DB): allowlist, 64 KB cap,
 * symlinks ignored, `.env.example` content never read (NFR4).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, symlink, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsRootFiles } from '../src/adapters/root-files/fs-root-files.js';

const repo = { owner: 'o', name: 'r' };
let root: string;
let outside: string;
let reads: string[];

const adapter = (dir = root) =>
  new FsRootFiles({
    clonePathFor: () => dir,
    readFile: async (p) => {
      reads.push(p);
      const { readFile } = await import('node:fs/promises');
      return readFile(p);
    },
  });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'onb-root-'));
  outside = await mkdtemp(join(tmpdir(), 'onb-out-'));
  reads = [];
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('FsRootFiles', () => {
  it('reads package.json, Makefile, compose files and README from the root', async () => {
    await writeFile(join(root, 'package.json'), '{"name":"x"}');
    await writeFile(join(root, 'Makefile'), 'build:\n\tx\n');
    await writeFile(join(root, 'docker-compose.yml'), 'services:\n  db:\n');
    await writeFile(join(root, 'README.md'), '# Hi');
    const s = (await adapter().read(repo))!;
    expect(s.packageJson).toBe('{"name":"x"}');
    expect(s.makefile).toContain('build:');
    expect(s.composeFiles).toEqual([{ name: 'docker-compose.yml', text: 'services:\n  db:\n' }]);
    expect(s.readme).toEqual({ name: 'README.md', text: '# Hi' });
  });

  it('skips a 70 KB package.json as too_large (64 KB cap) and reads a 60 KB one', async () => {
    await writeFile(join(root, 'package.json'), 'a'.repeat(70 * 1024));
    await writeFile(join(root, 'Makefile'), 'm'.repeat(60 * 1024));
    const s = (await adapter().read(repo))!;
    expect(s.packageJson).toBeNull();
    expect(s.skipped).toContainEqual({ name: 'package.json', reason: 'too_large' });
    expect(s.makefile).not.toBeNull();
  });

  it('NFR4: .env.example is presence-only, never opened, value never in the snapshot', async () => {
    await writeFile(join(root, '.env.example'), 'SECRET=sk-live-XYZ\n');
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lock-content-marker');
    const s = (await adapter().read(repo))!;
    expect(s.hasEnvExample).toBe(true);
    expect(s.lockfiles).toEqual(['pnpm-lock.yaml']);
    const serialized = JSON.stringify(s);
    expect(serialized).not.toContain('sk-live-XYZ');
    expect(serialized).not.toContain('lock-content-marker');
    expect(reads.some((p) => p.endsWith('.env.example') || p.endsWith('pnpm-lock.yaml'))).toBe(false);
  });

  it('ignores a symlinked allowlisted file (cannot escape the clone root)', async () => {
    await writeFile(join(outside, 'target'), 'outside-secret');
    await symlink(join(outside, 'target'), join(root, 'Makefile'));
    await symlink(join(outside, 'target'), join(root, 'README.md'));
    const s = (await adapter().read(repo))!;
    expect(s.makefile).toBeNull();
    expect(s.readme).toBeNull();
    expect(JSON.stringify(s)).not.toContain('outside-secret');
  });

  it('does not read files outside the allowlist or in subdirectories', async () => {
    await writeFile(join(root, 'secrets.txt'), 'nope');
    await writeFile(join(root, 'notes.md'), 'nope');
    await mkdir(join(root, 'sub'));
    await writeFile(join(root, 'sub', 'package.json'), '{"sub":1}');
    const s = (await adapter().read(repo))!;
    expect(s.packageJson).toBeNull();
    expect(s.readme).toBeNull();
    expect(reads).toEqual([]);
  });

  it('flags a non-UTF-8 file as not_utf8', async () => {
    await writeFile(join(root, 'package.json'), Buffer.from([0xff, 0xfe, 0xfd, 0x80]));
    const s = (await adapter().read(repo))!;
    expect(s.packageJson).toBeNull();
    expect(s.skipped).toContainEqual({ name: 'package.json', reason: 'not_utf8' });
  });

  it('returns null when the clone root is missing', async () => {
    expect(await adapter(join(root, 'does-not-exist')).read(repo)).toBeNull();
  });
});
