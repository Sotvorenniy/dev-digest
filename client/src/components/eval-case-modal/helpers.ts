import { createTwoFilesPatch } from "diff";
import type { EvalCaseFields, EvalExpectedOutput } from "@devdigest/shared";

/** Light client-side check of the expected-output JSON. The server owns the full schema. */
export function parseExpected(text: string): EvalExpectedOutput | null {
  try {
    const raw = JSON.parse(text) as unknown;
    // `[]` is the short form of a clean-diff case: the agent must report nothing.
    if (Array.isArray(raw)) return raw.length === 0 ? { type: "must_not_flag", items: [] } : null;
    const v = raw as Partial<EvalExpectedOutput> | null;
    if (!v || typeof v !== "object") return null;
    if (v.type !== "must_find" && v.type !== "must_not_flag") return null;
    if (!Array.isArray(v.items)) return null;
    return v as EvalExpectedOutput;
  } catch {
    return null;
  }
}

/** Template for one expected finding, to fill in by hand. */
export const FINDING_SKELETON = {
  file: "path/to/file.ts",
  start_line: 1,
  end_line: 1,
  title: "What the agent should report",
  severity: "WARNING",
  category: "security",
} as const;

/** Add one skeleton item to the expected-output JSON text; `null` when the text is not valid. */
export function withSkeleton(text: string): string | null {
  const parsed = parseExpected(text);
  if (!parsed) return null;
  return JSON.stringify({ ...parsed, items: [...parsed.items, FINDING_SKELETON] }, null, 2);
}

export function toFields(
  draft: EvalCaseFields,
  edited: { name: string; diff: string; expected: EvalExpectedOutput; filePath?: string },
): EvalCaseFields {
  const filePath = edited.filePath?.trim();
  return {
    name: edited.name.trim(),
    input_diff: edited.diff,
    input_files: filePath ? [filePath] : draft.input_files,
    input_meta: draft.input_meta,
    expected_output: edited.expected,
  };
}

/** Hunks-only unified diff of `before` → `after`, the shape the eval runner expects (it adds the
 *  file headers itself). Empty `before` is a new file. Empty string when nothing changed.
 *  `createTwoFilesPatch` puts `Index:` / `---` / `+++` lines ahead of the first `@@`; they are cut. */
export function hunkFromTexts(before: string, after: string): string {
  // A missing final newline would add a "\\ No newline at end of file" marker line to the hunk.
  // CRLF and lone CR are folded to LF so text pasted from a Windows file diffs line by line.
  const nl = (raw: string) => {
    const v = raw.replace(/\r\n?/g, "\n");
    return v === "" || v.endsWith("\n") ? v : `${v}\n`;
  };
  const full = createTwoFilesPatch("a", "b", nl(before), nl(after), "", "");
  const start = full.indexOf("\n@@");
  return start === -1 ? "" : full.slice(start + 1).trimEnd();
}
