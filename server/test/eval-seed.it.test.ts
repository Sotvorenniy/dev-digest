/**
 * SPEC-06 AC16/EC21: the Security Reviewer's seeded eval cases are idempotent and reach a DB that
 * was seeded before the feature. Docker-gated; `EVAL_REQUIRE_DOCKER=1` makes a missing Docker fail.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
if (process.env.EVAL_REQUIRE_DOCKER === '1' && !hasDocker) throw new Error('verify:l06 needs Docker');
const d = hasDocker ? describe : describe.skip;

d('eval seed (Testcontainers pg)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const securityCases = async () => {
    const db = pg.handle.db;
    const [agent] = await db.select().from(t.agents).where(eq(t.agents.name, 'Security Reviewer'));
    return db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agent!.id)));
  };

  it('seeds >= 8 cases of both types, idempotently, and re-seeds after the cases are wiped', async () => {
    const db = pg.handle.db;
    await seed(db);
    const first = await securityCases();
    expect(first.length).toBeGreaterThanOrEqual(8);
    const types = new Set(first.map((c) => (c.expectedOutput as { type: string }).type));
    expect(types).toEqual(new Set(['must_find', 'must_not_flag']));

    await seed(db);
    expect((await securityCases()).length).toBe(first.length);

    await db.delete(t.evalCases);
    expect(await securityCases()).toHaveLength(0);
    await seed(db);
    expect((await securityCases()).length).toBeGreaterThanOrEqual(8);
  });
});
