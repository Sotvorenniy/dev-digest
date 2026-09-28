import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { SimpleGitClient } from '../src/adapters';

/**
 * A GitHub PAT used to be embedded into the clone URL, and `git clone` persists
 * the URL it is handed as `remote.origin.url` — leaving a live secret in
 * `<clone>/.git/config`, outside the secrets store and surviving rotation.
 *
 * These tests use a local "remote" so no network is involved; what is being
 * asserted is what ends up written into the checkout's config.
 */

const TOKEN = 'ghp_thisIsNotARealToken';

let root: string;
let remoteUrl: string;
let cloneDir: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'devdigest-git-'));

  // A throwaway upstream with one commit, then a bare mirror to clone from.
  const work = join(root, 'work');
  await mkdir(work, { recursive: true });
  const g = simpleGit(work);
  await g.init();
  await g.addConfig('user.email', 'test@example.com');
  await g.addConfig('user.name', 'Test');
  await writeFile(join(work, 'README.md'), '# fixture\n');
  await g.add('.');
  await g.commit('init');

  const bare = join(root, 'remote.git');
  await simpleGit(root).clone(work, bare, ['--bare']);
  remoteUrl = bare;

  cloneDir = join(root, 'clones');
  await mkdir(cloneDir, { recursive: true });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function gitConfigOf(path: string): Promise<string> {
  return readFile(join(path, '.git', 'config'), 'utf8');
}

describe('clone credentials never reach .git/config', () => {
  it('a fresh clone stores no credentials, even with a token configured', async () => {
    const client = new SimpleGitClient(cloneDir, async () => TOKEN);
    const { path } = await client.clone({ owner: 'acme', name: 'fresh' }, remoteUrl);

    const config = await gitConfigOf(path);
    expect(config).not.toContain(TOKEN);
    expect(config).not.toContain('x-access-token');
  });

  it('heals a checkout that already has an embedded credential', async () => {
    const client = new SimpleGitClient(cloneDir, async () => TOKEN);
    const { path } = await client.clone({ owner: 'acme', name: 'legacy' }, remoteUrl);

    // Recreate the old behaviour: a remote carrying the PAT, as clones made
    // before this fix still have on disk.
    await simpleGit(path).remote([
      'set-url',
      'origin',
      `https://x-access-token:${TOKEN}@github.com/acme/legacy.git`,
    ]);
    expect(await gitConfigOf(path)).toContain(TOKEN);

    // Re-cloning an existing checkout takes the fetch path, which sanitizes.
    // The fetch itself fails (the remote now points at a repo that isn't there),
    // but the sanitize runs first and is what this asserts.
    await client.clone({ owner: 'acme', name: 'legacy' }, remoteUrl).catch(() => undefined);

    const config = await gitConfigOf(path);
    expect(config).not.toContain(TOKEN);
    expect(config).toContain('https://github.com/acme/legacy.git');
  });

  it('works unchanged when no token is configured', async () => {
    const client = new SimpleGitClient(cloneDir);
    const { path } = await client.clone({ owner: 'acme', name: 'anon' }, remoteUrl);
    expect(await gitConfigOf(path)).not.toContain('extraHeader');
  });
});
