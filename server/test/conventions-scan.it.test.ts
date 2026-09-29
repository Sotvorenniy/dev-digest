import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions-scan] Docker not available — skipping integration tests.');
}

/**
 * Full detection pipeline (sample → batched extraction → cluster/merge →
 * verify → score → ground → persist) against a mocked LLMProvider and a
 * real on-disk fixture clone. Covers: the happy path lands grounded,
 * confidence-scored `pending` candidates and a `done` scan state; a repo
 * with no clone fails cleanly (never stuck on queued/running).
 */
d('conventions scan pipeline', () => {
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

  it('GET /repos/:id/conventions on an unscanned repo reports never_run with no candidates', async () => {
    const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, null);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ config, db: pg.handle.db });

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ candidates: [], scan: { repo_id: repoId, status: 'never_run', sampled_file_count: 0, candidate_count: 0 } });
    await app.close();
  });

  it('runs the full pipeline: scan → cluster/merge → verify → score → ground → persist', async () => {
    const { clonePath, cleanup } = await writeConventionsFixtureClone();
    try {
      const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, clonePath);
      const llm = new MockLLMProvider('openai', { structuredBySchema: buildTwoCandidateLlmFixture() });
      const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      const app = await buildApp({
        config,
        db: pg.handle.db,
        overrides: {
          repoIntel: makeStubRepoIntel(Object.keys(CONVENTIONS_FIXTURE_FILES)),
          llm: { openai: llm },
        },
      });

      const scanRes = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
      expect(scanRes.statusCode).toBe(202);
      expect(scanRes.json()).toMatchObject({ status: 'accepted' });
      expect(scanRes.json().jobId).toBeTruthy();

      await app.container.jobs.onIdle();

      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect(body.scan).toMatchObject({
        repo_id: repoId,
        status: 'done',
        sampled_file_count: 3,
        candidate_count: 2,
      });
      expect(body.scan.started_at).toBeTruthy();
      expect(body.scan.finished_at).toBeTruthy();

      expect(body.candidates).toHaveLength(2);
      const rules = body.candidates.map((c: { rule: string }) => c.rule).sort();
      expect(rules).toEqual(
        [
          'I/O functions are always async and use await',
          'Side-effecting functions log via console.log',
        ].sort(),
      );
      for (const candidate of body.candidates) {
        expect(candidate.repo_id).toBe(repoId);
        expect(candidate.status).toBe('pending');
        expect(['error-handling', 'style']).toContain(candidate.category);
        expect(candidate.confidence).toBeGreaterThanOrEqual(0.35);
        expect(candidate.confidence).toBeLessThanOrEqual(1);
        // Grounding gate passed — evidence path is one of the sampled fixture files.
        expect(Object.keys(CONVENTIONS_FIXTURE_FILES)).toContain(candidate.evidence_path);
      }

      // Every LLM call in one scan shares a session id (OpenRouter grouping) —
      // observable via the mock's recorded calls.
      const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
      expect(structuredCalls.length).toBeGreaterThanOrEqual(3); // 1 scan batch + 1 merge + 1 verify
      const sessionIds = new Set(
        structuredCalls.map((c) => (c.req as { sessionId?: string }).sessionId),
      );
      expect(sessionIds.size).toBe(1);

      await app.close();
    } finally {
      await cleanup();
    }
  });

  it('a repo with no clone fails the scan cleanly — never stuck on queued/running', async () => {
    const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, null);
    const llm = new MockLLMProvider('openai', { structuredBySchema: buildTwoCandidateLlmFixture() });
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        repoIntel: makeStubRepoIntel(Object.keys(CONVENTIONS_FIXTURE_FILES)),
        llm: { openai: llm },
      },
    });

    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    await app.container.jobs.onIdle();

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    const body = res.json();
    expect(body.scan.status).toBe('failed');
    expect(body.scan.error).toBeTruthy();
    expect(body.candidates).toHaveLength(0);

    await app.close();
  });
});
