/**
 * GET /pulls/:id/smart-diff against the seeded PR #482: roles, finding lines
 * and workspace scoping. Gated on Docker like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SmartDiffResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('smart-diff route (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('groups PR #482 by role and flags the config.ts finding at line 12 in core', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.number, 482)));
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiffResponse.parse(res.json());
    const core = body.groups.find((g) => g.role === 'core');
    const config_ts = core?.files.find((f) => f.path === 'src/config.ts');
    expect(config_ts?.finding_lines).toContain(12);
  });

  it('404s for an unknown pull request', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-4000-8000-000000000000/smart-diff',
    });
    expect(res.statusCode).toBe(404);
  });
});
