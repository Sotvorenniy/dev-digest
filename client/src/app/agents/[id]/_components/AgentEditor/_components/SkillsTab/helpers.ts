import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** Linked skill ids, in prompt-assembly order (defensive sort — the API already
 *  orders them, but `order` is the source of truth if that ever changes). */
export function toLinkedIds(links: AgentSkillLink[]): string[] {
  return [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
}

/** Display order: linked skills first (in link order), then every unlinked
 *  skill — so reorder arrows only ever swap adjacent *linked* rows. */
export function toDisplayOrder(skills: Skill[], linkedIds: string[]): Skill[] {
  const linkedSet = new Set(linkedIds);
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linked = linkedIds.map((id) => byId.get(id)).filter((sk): sk is Skill => !!sk);
  const unlinked = skills.filter((sk) => !linkedSet.has(sk.id));
  return [...linked, ...unlinked];
}

/** Case-insensitive filter over a skill's name. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => sk.name.toLowerCase().includes(q));
}

/** Toggle a skill's link: append when attaching, remove when detaching. */
export function toggleLinked(linkedIds: string[], skillId: string): string[] {
  return linkedIds.includes(skillId) ? linkedIds.filter((id) => id !== skillId) : [...linkedIds, skillId];
}

/** Swap a linked skill with its neighbor in the given direction. No-op past an edge. */
export function moveLinked(linkedIds: string[], skillId: string, dir: -1 | 1): string[] {
  const i = linkedIds.indexOf(skillId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= linkedIds.length) return linkedIds;
  const next = [...linkedIds];
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  return next;
}

/** Only an attached skill may be dragged or drop-targeted. */
export function isReorderable(skill: Skill, linkedIds: string[]): boolean {
  return linkedIds.includes(skill.id);
}

/** Drag `fromId` onto `toId`: move it to that slot in the linked order.
 *  Returns null (no change) unless BOTH rows are attached. */
export function reorderLinked(
  linkedIds: string[],
  skills: Skill[],
  fromId: string,
  toId: string,
): string[] | null {
  if (fromId === toId) return null;
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from || !to || !isReorderable(from, linkedIds) || !isReorderable(to, linkedIds)) return null;
  const next = linkedIds.filter((id) => id !== fromId);
  next.splice(next.indexOf(toId) + (linkedIds.indexOf(fromId) < linkedIds.indexOf(toId) ? 1 : 0), 0, fromId);
  return next;
}

/** Re-seat the linked ids into the slots linked rows already occupy in the
 *  frozen row order, so unlinked rows never move when linked rows reorder. */
export function applyLinkedOrder(rowOrder: string[], linkedIds: string[]): string[] {
  const linkedSet = new Set(linkedIds);
  const queue = [...linkedIds];
  return rowOrder.map((id) => (linkedSet.has(id) ? (queue.shift() ?? id) : id));
}
