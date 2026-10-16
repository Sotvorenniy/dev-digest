import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type { ContextClonePort, ProjectContextRepositoryPort } from '../src/modules/project-context/ports.js';
import { FsProjectDocs } from '../src/adapters/project-docs/fs-project-docs.js';

/** Reindex: sync the clone from origin, then rescan. Real FsProjectDocs on a tmp clone, fake sync. */

const REPO_ID = '11111111-1111-4111-8111-111111111111';

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pcr-'));
  await mkdir(join(tmp, 'specs'), { recursive: true });
  await writeFile(join(tmp, 'specs', 'a.md'), '# A');
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function service(clone: ContextClonePort) {
  const repo: ProjectContextRepositoryPort = {
    findRepo: async (_ws, id) => (id === REPO_ID ? { id, owner: 'acme', name: 'x', defaultBranch: 'trunk' } : null),
    agentExists: async () => true,
    skillExists: async () => true,
    listPaths: async () => [],
    replacePaths: async () => undefined,
    usedByAgents: async () => new Map(),
    skillPaths: async () => new Map(),
  };
  return new ProjectContextService({
    repo,
    docs: new FsProjectDocs({
      clonePathFor: () => tmp,
      roots: ['**/{specs,docs,insights}/**/*.md'],
      excludedDirs: ['node_modules', '.git'],
      maxVisitedFiles: 5_000,
    }),
    clone,
  });
}

describe('ProjectContextService.reindex', () => {
  it('syncs the default branch, then returns the rescanned list', async () => {
    const calls: string[] = [];
    const svc = service({
      sync: async (_repo, branch) => {
        calls.push(branch);
        // What a pull from origin would bring in.
        await mkdir(join(tmp, 'docs'), { recursive: true });
        await writeFile(join(tmp, 'docs', 'new.md'), '# New');
      },
    });
    const list = await svc.reindex('ws', REPO_ID);
    expect(calls).toEqual(['trunk']);
    expect(list.docs.map((d) => d.path)).toEqual(['docs/new.md', 'specs/a.md']);
  });

  it('maps a failed sync to clone_unavailable (409)', async () => {
    const svc = service({
      sync: async () => {
        throw new Error('fatal: not a git repository');
      },
    });
    await expect(svc.reindex('ws', REPO_ID)).rejects.toMatchObject({ code: 'clone_unavailable', statusCode: 409 });
  });

  it('answers repo_not_found before any sync', async () => {
    let synced = false;
    const svc = service({
      sync: async () => {
        synced = true;
      },
    });
    await expect(svc.reindex('ws', '22222222-2222-4222-8222-222222222222')).rejects.toMatchObject({
      code: 'repo_not_found',
    });
    expect(synced).toBe(false);
  });
});
