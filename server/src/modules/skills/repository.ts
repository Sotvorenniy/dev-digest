import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import { DEFAULT_SKILL_DESCRIPTION, INITIAL_SKILL_VERSION } from './constants.js';
import { isSkillBodyChange } from './helpers.js';
import type { SkillsRepositoryPort } from './ports.js';

/**
 * A1 — skills data-access. Owns `skills` and `skill_versions`. The
 * `agent_skills` link table is owned by A2's `AgentsRepository` (agent side).
 * Workspace-scoped throughout. Infrastructure: the only place a raw
 * `SkillRow`/`SkillVersionRow` is seen — every public method returns the
 * mapped domain type (`Skill`/`SkillVersion`), never the row.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

function toSkillDomain(row: SkillRow, agentCount = 0): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    agent_count: agentCount,
  };
}

function toSkillVersionDomain(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    change_note: row.changeNote,
    created_at: row.createdAt.toISOString(),
  };
}

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[];
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  changeNote?: string;
}

export class SkillsRepository implements SkillsRepositoryPort {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<Skill[]> {
    // Explicit order: Postgres gives no row-order guarantee without one, and
    // an UPDATE (e.g. toggling `enabled`) can shift a row's physical tuple,
    // reshuffling an unordered SELECT's result on the very next fetch.
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.createdAt));
    // One grouped query for every skill's link count (no N+1).
    const counts = await this.db
      .select({ skillId: t.agentSkills.skillId, n: count() })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.agentSkills.skillId);
    const byId = new Map(counts.map((c) => [c.skillId, Number(c.n)]));
    return rows.map((r) => toSkillDomain(r, byId.get(r.id) ?? 0));
  }

  async getById(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.getRowById(workspaceId, id);
    return row ? this.withAgentCount(row) : undefined;
  }

  private async withAgentCount(row: SkillRow): Promise<Skill> {
    return toSkillDomain(row, await this.countAgents(row.id));
  }

  private async countAgents(skillId: string): Promise<number> {
    const [c] = await this.db
      .select({ n: count() })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, skillId));
    return Number(c?.n ?? 0);
  }

  private async getRowById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). Versions + agent_skills links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in skill_versions (immutable snapshot). */
  async insert(values: InsertSkill): Promise<Skill> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_SKILL_DESCRIPTION,
        type: values.type,
        source: values.source ?? 'manual',
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION, null);
    return toSkillDomain(row!);
  }

  /**
   * Update a skill. A name/description/type/body change bumps the version and
   * snapshots the new body into skill_versions; toggling `enabled` alone does not.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<Skill | undefined> {
    const existing = await this.getRowById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = isSkillBodyChange(existing, patch);
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) {
      await this.snapshotVersion(row, nextVersion, patch.changeNote ?? null);
    }
    return row ? this.withAgentCount(row) : undefined;
  }

  // ---- skill_versions (immutable body snapshots) ---------------------------

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersion[]> {
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map(toSkillVersionDomain);
  }

  /**
   * Restore an older version's body as current — the same version-bump +
   * snapshot as a body-changing `update`, with an auto change_note. Returns
   * undefined if the skill or that version doesn't exist.
   */
  async restoreVersion(id: string, version: number): Promise<Skill | undefined> {
    const [snapshot] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, id), eq(t.skillVersions.version, version)));
    if (!snapshot) return undefined;

    const [existing] = await this.db.select().from(t.skills).where(eq(t.skills.id, id));
    if (!existing) return undefined;

    const nextVersion = existing.version + 1;
    const [row] = await this.db
      .update(t.skills)
      .set({ body: snapshot.body, version: nextVersion })
      .where(eq(t.skills.id, id))
      .returning();

    if (row) await this.snapshotVersion(row, nextVersion, `Restored from v${version}`);
    return row ? this.withAgentCount(row) : undefined;
  }

  private async snapshotVersion(
    row: SkillRow,
    version: number,
    changeNote: string | null,
  ): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body, changeNote })
      .onConflictDoNothing();
  }
}
