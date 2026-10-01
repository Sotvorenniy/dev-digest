import type { SkillType } from "@devdigest/shared";

/* @devdigest/shared is type-only on the client, so SkillType's runtime values
   are mirrored by hand. Keep in sync with the shared enum. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
export const DEFAULT_IMPORT_SKILL_TYPE: SkillType = "custom";
