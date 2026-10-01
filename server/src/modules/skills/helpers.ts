import type { Skill, SkillType } from '@devdigest/shared';

/**
 * Pure helpers for the skills module — the body-version-bump rule. No I/O.
 * Row <-> domain mapping lives in repository.ts (infrastructure), never here.
 */

/** Fields whose change bumps the skill's version (NOT `enabled`, NOT `change_note`). */
export interface SkillBodyChangePatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
}

/**
 * True when a patch changes name/description/type/body relative to the
 * existing skill — this is the set that bumps the version and snapshots
 * skill_versions. Toggling `enabled` alone does not.
 */
export function isSkillBodyChange(
  existing: Pick<Skill, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillBodyChangePatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}
