import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { JobRunner } from '../src/platform/jobs.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[jobs] Docker not available — skipping integration tests.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * `JobRunner` regression coverage for two bugs found via live manual testing
 * of the conventions-scan feature (a real multi-call LLM pipeline was the
 * first job kind to ever run long enough to hit them):
 *
 *  1. A job that outlives its timeout used to crash the WHOLE process — the
 *     `queue.add(...)` promise (`done`) rejected and nothing anywhere caught
 *     it, which Node treats as a fatal unhandled rejection. `enqueue()` now
 *     attaches a no-op `.catch()` so a slow/failed job only fails itself.
 *  2. The 120s/2-retries default is global; a per-kind override (via
 *     `register(kind, handler, {timeoutMs, retries})`) lets a job that
 *     genuinely needs longer (or shouldn't be blindly retried from scratch)
 *     get its own budget without changing every other job kind's behavior.
 */
d('JobRunner', () => {
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

  it('runs a job to completion and marks it done', async () => {
    const runner = new JobRunner(pg.handle.db, { timeoutMs: 2000, retries: 0 });
    runner.register('ok-kind', async () => {
      await sleep(10);
    });

    const job = await runner.enqueue(workspaceId, 'ok-kind', {});
    await job.done;

    const [row] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, job.id));
    expect(row!.status).toBe('done');
  });

  it('marks a job failed on error, and never crashes the process', async () => {
    const runner = new JobRunner(pg.handle.db, { timeoutMs: 2000, retries: 0 });
    runner.register('bad-kind', async () => {
      throw new Error('boom');
    });

    const job = await runner.enqueue(workspaceId, 'bad-kind', {});
    // `done` still rejects for a caller that awaits it directly...
    await expect(job.done).rejects.toThrow('boom');

    const [row] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, job.id));
    expect(row!.status).toBe('failed');
    expect(row!.error).toContain('boom');
  });

  it('never surfaces an unhandled rejection for a caller that does NOT await `done`', async () => {
    // This is the actual shape every route uses (repo-intel's `/resync`,
    // conventions' `/scan`): enqueue, respond 202, never await `done`. Before
    // the fix, a job outliving its timeout crashed the whole server here —
    // there is no per-test way to assert "the process didn't exit", so this
    // asserts the weaker but meaningful property that the runner stays usable
    // (accepts and completes a fresh job) immediately after an un-awaited
    // job's timeout fires, which would not hold if the process had died.
    const runner = new JobRunner(pg.handle.db, { timeoutMs: 50, retries: 0 });
    runner.register('slow-kind', () => new Promise<void>(() => {})); // never resolves
    runner.register('ok-kind', async () => {});

    const slow = await runner.enqueue(workspaceId, 'slow-kind', {});
    // Deliberately NOT awaiting `slow.done` — matches every real call site.
    await sleep(150); // let the 50ms timeout fire and reject `done` unobserved here

    const [slowRow] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, slow.id));
    expect(slowRow!.status).toBe('failed');
    expect(slowRow!.error).toContain('timed out');

    const ok = await runner.enqueue(workspaceId, 'ok-kind', {});
    await ok.done; // if the process were dead this would never resolve
    const [okRow] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, ok.id));
    expect(okRow!.status).toBe('done');
  });

  it('applies a per-kind timeout/retries override instead of the runner default', async () => {
    const runner = new JobRunner(pg.handle.db, { timeoutMs: 60_000, retries: 2 }); // generous default
    let attempts = 0;
    runner.register(
      'short-budget-kind',
      async () => {
        attempts++;
        await sleep(200); // outlives the per-kind override below, not the runner default
      },
      { timeoutMs: 50, retries: 0 }, // override: tight budget, no retry-from-scratch
    );

    const job = await runner.enqueue(workspaceId, 'short-budget-kind', {});
    await expect(job.done).rejects.toThrow('timed out');
    await sleep(50); // let any (unexpected) retry attempt start, if the override were ignored

    expect(attempts).toBe(1); // retries: 0 honored — no wasted re-run of the whole handler
    const [row] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, job.id));
    expect(row!.status).toBe('failed');
  });
});
