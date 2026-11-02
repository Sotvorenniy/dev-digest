import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiAgent, CiInstallationRecord, CiRepositoryPort } from './ports.js';

type InstallationRow = typeof t.ciInstallations.$inferSelect;

function toRecord(row: InstallationRow): CiInstallationRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    repo: row.repo,
    targetType: row.targetType,
    installedAt: row.installedAt,
    prUrl: row.prUrl,
  };
}

/** Data access for CI installations; also reads the agent + skills the export needs. */
export class CiRepository implements CiRepositoryPort {
  constructor(private db: Db) {}

  async getAgent(workspaceId: string, agentId: string): Promise<CiAgent | undefined> {
    const [agent] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    if (!agent) return undefined;
    const skills = await this.db
      .select({ name: t.skills.name, body: t.skills.body })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agent.id))
      .orderBy(asc(t.agentSkills.order));
    return {
      id: agent.id,
      name: agent.name,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      strategy: agent.strategy,
      ciFailOn: agent.ciFailOn,
      skills,
    };
  }

  async isRepoImported(workspaceId: string, fullName: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)))
      .limit(1);
    return !!row;
  }

  async listInstallations(agentId: string): Promise<CiInstallationRecord[]> {
    const rows = await this.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agentId))
      .orderBy(desc(t.ciInstallations.installedAt));
    return rows.map(toRecord);
  }

  async findInstallationByRepo(
    workspaceId: string,
    repo: string,
  ): Promise<{ agentId: string; agentName: string } | undefined> {
    const [row] = await this.db
      .select({ agentId: t.ciInstallations.agentId, agentName: t.agents.name })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.repo, repo)))
      .limit(1);
    return row;
  }

  async upsertInstallation(v: {
    workspaceId: string;
    agentId: string;
    repo: string;
    targetType: 'gha';
    prUrl: string;
  }): Promise<CiInstallationRecord | undefined> {
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        workspaceId: v.workspaceId,
        agentId: v.agentId,
        repo: v.repo,
        targetType: v.targetType,
        prUrl: v.prUrl,
      })
      .onConflictDoUpdate({
        target: [t.ciInstallations.workspaceId, t.ciInstallations.repo],
        set: { prUrl: v.prUrl, installedAt: new Date() },
        // Only the owning agent may update; another agent's row yields no result.
        setWhere: eq(t.ciInstallations.agentId, v.agentId),
      })
      .returning();
    return row ? toRecord(row) : undefined;
  }
}
