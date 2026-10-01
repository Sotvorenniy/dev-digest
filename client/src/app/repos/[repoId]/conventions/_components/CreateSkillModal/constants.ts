import type { SkillType } from "@devdigest/shared";

/* @devdigest/shared is type-only on the client — SkillType's runtime values
   are mirrored here by hand (same reasoning as the skills ConfigTab's own
   SKILL_TYPES and client/src/lib/feature-models.ts). Keep in sync with the
   shared enum. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

export const DEFAULT_SKILL_TYPE: SkillType = "convention";

/** Modal width (px) — matches CreateAgentModal's. */
export const MODAL_WIDTH = 680;
