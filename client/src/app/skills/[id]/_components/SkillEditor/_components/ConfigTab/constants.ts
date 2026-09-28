import type { SkillType } from "@devdigest/shared";

/* @devdigest/shared is type-only on the client — SkillType's runtime values
   are mirrored here by hand (same reasoning as client/src/lib/feature-models.ts
   for the per-feature model registry). Keep in sync with the shared enum. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
