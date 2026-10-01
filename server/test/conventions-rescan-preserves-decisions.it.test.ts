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
  console.warn('[conventions-rescan] Docker not available — skipping integration tests.');
}

/** A single-candidate scan fixture (one cluster → `mergeConventionCandidates`
 *  short-circuits with no LLM call, id becomes `merged-cluster-0`). */
function buildSecondScanLlmFixture(): Record<string, unknown> {
  return {
    ConventionScanBatch: {
      candidates: [
        {
          rule: 'Constants live in named exports',
          evidence_path: 'src/c.ts',
          evidence_snippet: 'export const VERSION = 1;',
          evidence_start_line: 1,
          evidence_end_line: 1,
          confidence: 0.9,
        },
      ],
    },
    VerifyConventions: {
      results: [
        {
          candidate_id: 'merged-cluster-0',
          confirmed_in_files: ['src/a.ts'],
          contradicted_in_files: [],
          verdict: 'repo_wide',
        },
      ],
    },
  };
}

d('conventions rescan preserves accept/reject decisions', () => {
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

  it('rescan wipes only pending rows — accepted/rejected survive, a stale pending row is removed', async () => {
    const { clonePath, cleanup } = await writeConventionsFixtureClone();
    try {
      const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, clonePath);
      const repoIntel = makeStubRepoIntel(Object.keys(CONVENTIONS_FIXTURE_FILES));
      const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

      // --- Scan #1: produces two pending candidates. ---
      const llm1 = new MockLLMProvider('openai', { structuredBySchema: buildTwoCandidateLlmFixture() });
      const app1 = await buildApp({
        config,
        db: pg.handle.db,
        overrides: { repoIntel, llm: { openai: llm1 } },
      });
      await app1.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
      await app1.container.jobs.onIdle();

      const afterScan1 = (
        await app1.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })
      ).json();
      expect(afterScan1.candidates).toHaveLength(2);
      const [c1, c2] = afterScan1.candidates as { id: string; rule: string }[];

      // Accept one, reject the other.
      await app1.inject({
        method: 'PATCH',
        url: `/repos/${repoId}/conventions/${c1!.id}`,
        payload: { status: 'accepted' },
      });
      await app1.inject({
        method: 'PATCH',
        url: `/repos/${repoId}/conventions/${c2!.id}`,
        payload: { status: 'rejected' },
      });

      // A lingering pending row (simulating a stale candidate from a prior
      // scan nobody reviewed yet) — rescan must wipe exactly this one.
      const [lingering] = await pg.handle.db
        .insert(t.conventions)
        .values({
          workspaceId,
          repoId,
          rule: 'stale unreviewed candidate',
          evidencePath: 'src/a.ts',
          evidenceSnippet: 'export async function fetchThing() {',
          evidenceStartLine: 1,
          evidenceEndLine: 1,
          confidence: 0.5,
          status: 'pending',
        })
        .returning();

      await app1.close();

      // --- Scan #2 (rescan): a different candidate set. ---
      const llm2 = new MockLLMProvider('openai', { structuredBySchema: buildSecondScanLlmFixture() });
      const app2 = await buildApp({
        config,
        db: pg.handle.db,
        overrides: { repoIntel, llm: { openai: llm2 } },
      });
      await app2.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
      await app2.container.jobs.onIdle();

      const afterScan2 = (
        await app2.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })
      ).json();

      const byId = new Map(
        (afterScan2.candidates as { id: string; rule: string; status: string }[]).map((c) => [c.id, c]),
      );

      // Accepted survives, unchanged.
      expect(byId.get(c1!.id)).toMatchObject({ status: 'accepted', rule: c1!.rule });
      // Rejected stays excluded from the listing.
      expect(byId.has(c2!.id)).toBe(false);
      // The stale pending row from before the rescan is gone.
      expect(byId.has(lingering!.id)).toBe(false);
      // The new scan's candidate is present, pending.
      const newOnes = [...byId.values()].filter(
        (c) => c.id !== c1!.id && c.id !== c2!.id && c.id !== lingering!.id,
      );
      expect(newOnes).toHaveLength(1);
      expect(newOnes[0]).toMatchObject({ status: 'pending', rule: 'Constants live in named exports' });

      expect(afterScan2.scan).toMatchObject({ status: 'done', candidate_count: 1 });

      await app2.close();
    } finally {
      await cleanup();
    }
  });
});
