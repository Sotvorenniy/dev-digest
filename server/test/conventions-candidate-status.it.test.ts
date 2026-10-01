import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { insertConventionsRepo } from './helpers/conventions-fixture.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions-candidate-status] Docker not available — skipping integration tests.');
}

/**
 * Accept / reject / edit a convention candidate via PATCH
 * `/repos/:id/conventions/:candidateId`, and confirm `status: 'rejected'` is
 * excluded from the GET response (checklist 47/48 — server-side filter, not a
 * client-side convention).
 */
d('conventions candidate accept/reject/edit', () => {
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

  async function insertCandidate(repoId: string, overrides: Partial<typeof t.conventions.$inferInsert> = {}) {
    const [row] = await pg.handle.db
      .insert(t.conventions)
      .values({
        workspaceId,
        repoId,
        rule: 'Always use async/await over .then chains',
        evidencePath: 'src/a.ts',
        evidenceSnippet: 'export async function fetchThing() {}',
        evidenceStartLine: 1,
        evidenceEndLine: 1,
        confidence: 0.7,
        status: 'pending',
        ...overrides,
      })
      .returning();
    return row!.id;
  }

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({ config, db: pg.handle.db });
  }

  it('PATCH status: accepted round-trips and is included in GET', async () => {
    const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, null);
    const candidateId = await insertCandidate(repoId);
    const app = await makeApp();

    const patch = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${candidateId}`,
      payload: { status: 'accepted' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({ id: candidateId, status: 'accepted' });

    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(list.json().candidates.map((c: { id: string }) => c.id)).toContain(candidateId);
    await app.close();
  });

  it('PATCH status: rejected is excluded from the next GET', async () => {
    const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, null);
    const keep = await insertCandidate(repoId, { rule: 'keep me' });
    const reject = await insertCandidate(repoId, { rule: 'reject me' });
    const app = await makeApp();

    const patch = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${reject}`,
      payload: { status: 'rejected' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().status).toBe('rejected');

    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const ids = list.candidates.map((c: { id: string }) => c.id);
    expect(ids).toContain(keep);
    expect(ids).not.toContain(reject);
    await app.close();
  });

  it('PATCH rule/evidence_snippet edits the candidate in place (no status change)', async () => {
    const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, null);
    const candidateId = await insertCandidate(repoId);
    const app = await makeApp();

    const patch = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${candidateId}`,
      payload: { rule: 'Edited rule text', evidence_snippet: 'edited snippet' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({
      id: candidateId,
      rule: 'Edited rule text',
      evidence_snippet: 'edited snippet',
      status: 'pending',
    });
    await app.close();
  });

  it('PATCH an unknown candidate id 404s', async () => {
    const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, null);
    const app = await makeApp();

    const res = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/00000000-0000-0000-0000-000000000000`,
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
