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

export function toFields(
  draft: EvalCaseFields,
  edited: { name: string; diff: string; expected: EvalExpectedOutput },
): EvalCaseFields {
  return {
    name: edited.name.trim(),
    input_diff: edited.diff,
    input_files: draft.input_files,
    input_meta: draft.input_meta,
    expected_output: edited.expected,
  };
}
