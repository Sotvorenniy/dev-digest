import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ContextOwnerKind, ContextRepoRef, ProjectContextRepositoryPort } from './ports.js';

/**
 * agent_context_docs / skill_context_docs plus the workspace-scoped lookups the
 * module needs. Implements ProjectContextRepositoryPort. Stores paths only, and
 * never touches `agents.version` / `skills.version`.
 */
export class ProjectContextRepository implements ProjectContextRepositoryPort {
  constructor(private readonly db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<ContextRepoRef | null> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name, defaultBranch: t.repos.defaultBranch })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  async agentExists(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return !!row;
  }

  async skillExists(workspaceId: string, skillId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return !!row;
  }

  async listPaths(kind: ContextOwnerKind, ownerId: string, repoId: string): Promise<string[]> {
    if (kind === 'agent') {
      const rows = await this.db
        .select({ path: t.agentContextDocs.path })
        .from(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, ownerId), eq(t.agentContextDocs.repoId, repoId)))
        .orderBy(asc(t.agentContextDocs.position));
      return rows.map((r) => r.path);
    }
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, ownerId), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.position));
    return rows.map((r) => r.path);
  }

  async replacePaths(
    kind: ContextOwnerKind,
    ownerId: string,
    repoId: string,
    paths: string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (kind === 'agent') {
        await tx
          .delete(t.agentContextDocs)
          .where(and(eq(t.agentContextDocs.agentId, ownerId), eq(t.agentContextDocs.repoId, repoId)));
        if (paths.length > 0) {
          await tx
            .insert(t.agentContextDocs)
            .values(paths.map((path, position) => ({ agentId: ownerId, repoId, path, position })));
        }
        return;
      }
      await tx
        .delete(t.skillContextDocs)
        .where(and(eq(t.skillContextDocs.skillId, ownerId), eq(t.skillContextDocs.repoId, repoId)));
      if (paths.length > 0) {
        await tx
          .insert(t.skillContextDocs)
          .values(paths.map((path, position) => ({ skillId: ownerId, repoId, path, position })));
      }
    });
  }

  async usedByAgents(repoId: string): Promise<Map<string, number>> {
    // path -> set of agent ids, from direct attachments and from linked skills.
    const direct = await this.db
      .select({ path: t.agentContextDocs.path, agentId: t.agentContextDocs.agentId })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.repoId, repoId));
    const viaSkill = await this.db
      .select({ path: t.skillContextDocs.path, agentId: t.agentSkills.agentId })
      .from(t.skillContextDocs)
      .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skillContextDocs.skillId))
      .where(eq(t.skillContextDocs.repoId, repoId));

    const sets = new Map<string, Set<string>>();
    for (const r of [...direct, ...viaSkill]) {
      const s = sets.get(r.path) ?? new Set<string>();
      s.add(r.agentId);
      sets.set(r.path, s);
    }
    return new Map([...sets].map(([path, s]) => [path, s.size]));
  }

  async skillPaths(skillIds: string[], repoId: string): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (skillIds.length === 0) return out;
    const rows = await this.db
      .select({ skillId: t.skillContextDocs.skillId, path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(and(inArray(t.skillContextDocs.skillId, skillIds), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.position));
    for (const r of rows) {
      const list = out.get(r.skillId) ?? [];
      list.push(r.path);
      out.set(r.skillId, list);
    }
    return out;
  }
}
