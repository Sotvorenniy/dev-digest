import type { EvalCaseFields, EvalExpectedOutput } from "@devdigest/shared";

/** Light client-side check of the expected-output JSON. The server owns the full schema. */
export function parseExpected(text: string): EvalExpectedOutput | null {
  try {
    const v = JSON.parse(text) as Partial<EvalExpectedOutput> | null;
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
