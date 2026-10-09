/**
 * GET /pulls/:id/blast against the seeded PR #482 with a stubbed repo-intel facade:
 * contract-valid 200, facade arguments, 404, and a 500 when the facade output violates the contract.
 * Gated on Docker like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeStubRepoIntel } from './helpers/repo-intel-stub.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/index.js';
import { BlastRadius } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('blast route (Testcontainers pg)', () => {
  let pg: PgFixture;
  let prId: string;
  let repoId: string;
  let paths: string[];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    prId = pr!.id;
    repoId = pr!.repoId;
    paths = (await pg.handle.db.select({ path: t.prFiles.path }).from(t.prFiles).where(eq(t.prFiles.prId, prId))).map(
      (r) => r.path,
    );
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function stub(getBlastRadius: RepoIntel['getBlastRadius']): RepoIntel {
    return { ...makeStubRepoIntel([]), getBlastRadius };
  }

  it('returns a contract-valid blast radius and queries the facade with the PR repo + files', async () => {
    const calls: [string, string[]][] = [];
    const repoIntel = stub(async (id, files) => {
      calls.push([id, files]);
      return {
        changedSymbols: [{ name: 'loadConfig', file: paths[0]!, kind: 'function' }],
        callers: [{ file: 'src/server.ts', symbol: 'boot', viaSymbol: 'loadConfig', line: 7, rank: 0.5 }],
        impactedEndpoints: ['GET /x'],
        factsByFile: { 'src/server.ts': { endpoints: ['GET /x'], crons: [] } },
      };
    });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel } });
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadius.parse(res.json());
    expect(body.downstream[0]!.endpoints_affected).toEqual(['GET /x']);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(repoId);
    expect([...calls[0]![1]].sort()).toEqual([...paths].sort());
    await app.close();
  });

  it('404s for an unknown pull request', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel: stub(async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [] })) } });
    const res = await app.inject({ method: 'GET', url: '/pulls/00000000-0000-4000-8000-000000000000/blast' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('500s (no raw leak) when the facade output violates the response contract', async () => {
    const repoIntel = stub(async () => ({
      // `line` must be an integer in the contract
      changedSymbols: [{ name: 'f', file: 'a.ts', kind: 'function' }],
      callers: [{ file: 'b.ts', symbol: 'g', viaSymbol: 'f', line: 1.5, rank: 0 }],
      impactedEndpoints: [],
    }));
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel } });
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('internal_error');
    await app.close();
  });
});
