import { and, asc, eq } from 'drizzle-orm';
import { PrBrief } from '@devdigest/shared';
import type { UnifiedDiff } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { extractHunkHeaders } from '../intent/domain.js';
import { BRIEF_HUNKS_PER_FILE } from './constants.js';
import type { BriefFileRow, BriefPull, BriefRepositoryPort } from './ports.js';

/** pull_requests / pr_files / pr_brief / agent_context_docs access for the brief module. */
export class BriefRepository implements BriefRepositoryPort {
  constructor(private readonly db: Db) {}

  async findPull(workspaceId: string, prId: string): Promise<BriefPull | undefined> {
    const [row] = await this.db
      .select({ pr: t.pullRequests, repo: t.repos })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    return {
      id: row.pr.id,
      repoId: row.pr.repoId,
      number: row.pr.number,
      title: row.pr.title,
      body: row.pr.body,
      headSha: row.pr.headSha,
      repo: { owner: row.repo.owner, name: row.repo.name },
    };
  }

  async listFiles(prId: string): Promise<BriefFileRow[]> {
    const rows = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((r) => ({
      path: r.path,
      additions: r.additions,
      deletions: r.deletions,
      hunks: extractHunkHeaders(r.patch, BRIEF_HUNKS_PER_FILE),
    }));
  }

  /** Rebuilt from persisted pr_files patches (same shape as reviews/diff-loader). */
  async getDiff(prId: string): Promise<UnifiedDiff> {
    const rows = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    const parts: string[] = [];
    for (const f of rows) {
      if (!f.patch) continue;
      parts.push(`diff --git a/${f.path} b/${f.path}`);
      parts.push(`--- a/${f.path}`);
      parts.push(`+++ b/${f.path}`);
      parts.push(f.patch);
    }
    return parseUnifiedDiff(parts.join('\n'));
  }

  async listEnabledAgentDocPaths(workspaceId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agents.enabled, true),
          eq(t.agentContextDocs.repoId, repoId),
        ),
      )
      .orderBy(asc(t.agents.createdAt), asc(t.agents.id), asc(t.agentContextDocs.position));
    return rows.map((r) => r.path);
  }

  async getBrief(prId: string): Promise<PrBrief | null> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    if (!row) return null;
    const parsed = PrBrief.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  async saveBrief(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
