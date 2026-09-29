import PQueue from 'p-queue';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as t from '../db/schema.js';
import { withTimeout, withRetry } from './resilience.js';
import { redactSecrets } from './redact.js';

/**
 * JobRunner — async work (clone, PR import, indexing, polling) on a
 * concurrency-limited p-queue, mirrored into the `jobs` table with
 * timeouts + retry/backoff.
 *
 * Handlers are registered by kind. enqueue() inserts a `jobs` row, schedules
 * the handler on the queue, and updates status/attempts/error as it runs.
 */

export type JobHandler = (payload: unknown, ctx: { jobId: string }) => Promise<void>;

export interface JobRunnerOptions {
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
}

/** Per-kind override of the runner's default timeout/retries (see `register`). */
export interface JobKindOptions {
  timeoutMs?: number;
  retries?: number;
}

export interface EnqueuedJob {
  id: string;
  /** Resolves when the job finishes (or rejects if it ultimately fails). */
  done: Promise<void>;
}

export class JobRunner {
  private queue: PQueue;
  private handlers = new Map<string, JobHandler>();
  private kindOptions = new Map<string, JobKindOptions>();
  private timeoutMs: number;
  private retries: number;

  constructor(
    private db: Db,
    opts: JobRunnerOptions = {},
  ) {
    this.queue = new PQueue({ concurrency: opts.concurrency ?? 3 });
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.retries = opts.retries ?? 2;
  }

  /**
   * `kindOpts` overrides the runner's default timeout/retries for jobs of
   * this kind only — e.g. a job that makes several sequential LLM calls
   * (conventions-scan) genuinely needs more than the default 120s budget
   * most jobs (clone/poll/index) comfortably finish inside, and re-running
   * an expensive multi-call pipeline from scratch on every transient error
   * is wasteful in a way a cheap job's retry isn't, so it may also want
   * fewer retries. Unset fields fall back to the runner's own default.
   */
  register(kind: string, handler: JobHandler, kindOpts?: JobKindOptions): void {
    this.handlers.set(kind, handler);
    if (kindOpts) this.kindOptions.set(kind, kindOpts);
  }

  async enqueue(workspaceId: string, kind: string, payload: unknown): Promise<EnqueuedJob> {
    const handler = this.handlers.get(kind);
    if (!handler) throw new Error(`No job handler registered for kind '${kind}'`);

    const [row] = await this.db
      .insert(t.jobs)
      .values({ workspaceId, kind, payload: payload as object, status: 'queued' })
      .returning({ id: t.jobs.id });
    const jobId = row!.id;
    const kindOpts = this.kindOptions.get(kind);
    const timeoutMs = kindOpts?.timeoutMs ?? this.timeoutMs;
    const retries = kindOpts?.retries ?? this.retries;

    const done = this.queue.add(async () => {
      await this.db
        .update(t.jobs)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(t.jobs.id, jobId));
      try {
        await withRetry(
          () =>
            withTimeout(handler(payload, { jobId }), timeoutMs).then(async () => {
              await this.db
                .update(t.jobs)
                .set({ attempts: 1 })
                .where(eq(t.jobs.id, jobId));
            }),
          {
            retries,
            onRetry: async (attempt) => {
              await this.db
                .update(t.jobs)
                .set({ attempts: attempt })
                .where(eq(t.jobs.id, jobId));
            },
          },
        );
        await this.db
          .update(t.jobs)
          .set({ status: 'done', finishedAt: new Date() })
          .where(eq(t.jobs.id, jobId));
      } catch (err) {
        await this.db
          .update(t.jobs)
          .set({
            status: 'failed',
            finishedAt: new Date(),
            // Redacted: this string is durable and unexposed to review, so a
            // credential that ever reaches an error message would sit here.
            error: redactSecrets((err as Error).message),
          })
          .where(eq(t.jobs.id, jobId));
        throw err;
      }
    }) as Promise<void>;

    // A job's failure is already durable (the `jobs` row above), and no
    // caller here awaits `done` — every route enqueues and returns 202
    // immediately, polling status via the DB instead. Without this catch,
    // an eventual rejection (a slow LLM pipeline blowing past `timeoutMs`,
    // in particular) is an unhandled promise rejection that crashes the
    // whole process, not just the one job. `done` itself is untouched and
    // still rejects for any caller that DOES choose to await it.
    done.catch(() => {});

    return { id: jobId, done };
  }

  /** Wait for the queue to drain (useful in tests). */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}
