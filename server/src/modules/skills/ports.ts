import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';

/** Port SkillsService depends on — SkillsRepository implements it. Speaks
 *  domain types only; row<->domain mapping happens inside the repository. */
export interface SkillsRepositoryPort {
  list(workspaceId: string): Promise<Skill[]>;
  getById(workspaceId: string, id: string): Promise<Skill | undefined>;
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  insert(values: {
    workspaceId: string;
    name: string;
    description?: string;
    type: SkillType;
    source?: SkillSource;
    body: string;
    enabled?: boolean;
  }): Promise<Skill>;
  update(
    workspaceId: string,
    id: string,
    patch: {
      name?: string;
      description?: string;
      type?: SkillType;
      body?: string;
      enabled?: boolean;
      changeNote?: string;
    },
  ): Promise<Skill | undefined>;
  listVersions(skillId: string): Promise<SkillVersion[]>;
  restoreVersion(id: string, version: number): Promise<Skill | undefined>;
}
