import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { makeStubRepoIntel } from './helpers/repo-intel-stub.js';
import {
  CONVENTIONS_FIXTURE_FILES,
  buildTwoCandidateLlmFixture,
  insertConventionsRepo,
  writeConventionsFixtureClone,
} from './helpers/conventions-fixture.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * `POST /repos/:id/conventions/extract` is an alias of `/scan`; sampling caps
 * source files at 12 and always adds root config files (tsconfig, eslint, ...).
 */
d('conventions extract alias + sampling', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('extract runs the same pipeline; config files join the samples; source files are capped at 12', async () => {
    const { clonePath, cleanup } = await writeConventionsFixtureClone();
    try {
      await writeFile(join(clonePath, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }\n');
      const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, clonePath);
      const llm = new MockLLMProvider('openai', { structuredBySchema: buildTwoCandidateLlmFixture() });
      // 12 unreadable paths first: the real fixture files sit beyond the cap and must be excluded.
      const paths = [
        ...Array.from({ length: 12 }, (_, i) => `missing/file-${i}.ts`),
        ...Object.keys(CONVENTIONS_FIXTURE_FILES),
      ];
      const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      const app = await buildApp({
        config,
        db: pg.handle.db,
        overrides: { repoIntel: makeStubRepoIntel(paths), llm: { openai: llm } },
      });

      const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toMatchObject({ status: 'accepted' });
      await app.container.jobs.onIdle();

      const body = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
      // Only tsconfig.json was sampled: 12 capped source paths are all missing.
      expect(body.scan.sampled_file_count).toBe(1);
      const scanCall = llm.calls.find((c) => c.method === 'completeStructured');
      expect(JSON.stringify(scanCall?.req)).toContain('tsconfig.json');

      // The legacy /scan route still works.
      const legacy = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
      expect(legacy.statusCode).toBe(202);
      await app.container.jobs.onIdle();
      await app.close();
    } finally {
      await cleanup();
    }
  });
});
