import { and, eq } from 'drizzle-orm';
import type { PrIntentRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { extractHunkHeaders } from './domain.js';
import type {
  IntentPullInfo,
  IntentRepoInfo,
  IntentRepositoryPort,
  IntentWrite,
} from './ports.js';

/** pr_intent / pull_requests access for the intent module. Implements IntentRepositoryPort. */
export class IntentRepository implements IntentRepositoryPort {
  constructor(private readonly db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<IntentPullInfo | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    return {
      id: row.id,
      repoId: row.repoId,
      number: row.number,
      title: row.title,
      author: row.author,
      branch: row.branch,
      headSha: row.headSha,
      body: row.body,
    };
  }

  async getRepo(repoId: string): Promise<IntentRepoInfo | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row ? { owner: row.owner, name: row.name } : undefined;
  }

  async listCommitSubjects(prId: string): Promise<string[]> {
    const rows = await this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
    return rows.map((r) => r.message.split('\n')[0]!.trim()).filter(Boolean);
  }

  async listFiles(prId: string): Promise<{ path: string; hunks: string[] }[]> {
    const rows = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((r) => ({ path: r.path, hunks: extractHunkHeaders(r.patch) }));
  }

  async getIntent(
    workspaceId: string,
    prId: string,
  ): Promise<(PrIntentRecord & { inputs_hash: string | null }) | undefined> {
    const [r] = await this.db
      .select({ i: t.prIntent })
      .from(t.prIntent)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prIntent.prId))
      .where(and(eq(t.prIntent.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    if (!r) return undefined;
    const row = r.i;
    return {
      pr_id: row.prId,
      intent: row.intent,
      in_scope: row.inScope,
      out_of_scope: row.outOfScope,
      change_type: row.changeType as PrIntentRecord['change_type'],
      confidence: row.confidence,
      basis: row.basis,
      sources: row.sources,
      requirements: row.requirements,
      provider: row.provider,
      model: row.model,
      head_sha: row.headSha,
      inputs_hash: row.inputsHash,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  async upsertIntent(v: IntentWrite): Promise<void> {
    const values = {
      intent: v.intent,
      inScope: v.inScope,
      outOfScope: v.outOfScope,
      changeType: v.changeType,
      confidence: v.confidence,
      basis: v.basis,
      sources: v.sources,
      requirements: v.requirements,
      provider: v.provider,
      model: v.model,
      headSha: v.headSha,
      inputsHash: v.inputsHash,
    };
    await this.db
      .insert(t.prIntent)
      .values({ prId: v.prId, ...values })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: { ...values, updatedAt: new Date() } });
  }
}
