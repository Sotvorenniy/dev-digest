import { diffLines } from "diff";
import type { EvalSetRun } from "@devdigest/shared";
import { MAX_HISTORY_ROWS } from "./constants";

/** Newest-first runs capped for display. */
export function visibleRuns(runs: readonly EvalSetRun[]): EvalSetRun[] {
  return runs.slice(0, MAX_HISTORY_ROWS);
}

/** Toggle `id` in the selection; a third pick drops the oldest pick. */
export function toggleSelection(selected: readonly string[], id: string, size: number): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return [...selected, id].slice(-size);
}

export interface PromptLine {
  kind: "added" | "removed";
  text: string;
}

/** Added/removed lines between two prompts; unchanged lines are omitted. */
export function promptLineDiff(oldPrompt: string, newPrompt: string): PromptLine[] {
  const out: PromptLine[] = [];
  for (const part of diffLines(oldPrompt, newPrompt)) {
    if (!part.added && !part.removed) continue;
    const kind = part.added ? "added" : "removed";
    for (const text of part.value.replace(/\n$/, "").split("\n")) out.push({ kind, text });
  }
  return out;
}
