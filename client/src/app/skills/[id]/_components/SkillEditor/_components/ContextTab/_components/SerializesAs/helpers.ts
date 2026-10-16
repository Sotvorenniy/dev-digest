import type { ProjectContextDoc } from "@/lib/types";
import { PROMPT_GROUP_ORDER } from "./constants";

export type PromptGroupKey = (typeof PROMPT_GROUP_ORDER)[number] | "other";

export interface PromptGroupItem {
  path: string;
  tokens: number | null;
  missing: boolean;
}

export interface PromptGroup {
  key: PromptGroupKey;
  items: PromptGroupItem[];
}

/** Attached paths grouped as the prompt serializes them: specs, docs, insights,
 *  other — attach order kept inside a group. Empty groups are dropped. */
export function groupForPrompt(attached: string[], docs: ProjectContextDoc[], missing: string[]): PromptGroup[] {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const missingSet = new Set(missing);
  const known = PROMPT_GROUP_ORDER as readonly string[];
  const groups: PromptGroup[] = [...PROMPT_GROUP_ORDER, "other" as const].map((key) => ({ key, items: [] }));
  for (const path of attached) {
    const doc = byPath.get(path);
    // A missing path has no listed type; fall back to its first folder.
    const type = doc?.type ?? path.split("/")[0] ?? "";
    const i = known.indexOf(type);
    groups[i === -1 ? known.length : i]!.items.push({
      path,
      tokens: doc?.tokens ?? null,
      missing: !doc || missingSet.has(path),
    });
  }
  return groups.filter((g) => g.items.length > 0);
}
