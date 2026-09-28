import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name + description. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q));
}

/** An unvetted skill: not created here and not yet reviewed + enabled. */
export function needsVetting(skill: Skill): boolean {
  return skill.source !== "manual" && !skill.enabled;
}
