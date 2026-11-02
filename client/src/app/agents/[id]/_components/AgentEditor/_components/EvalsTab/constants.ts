import type { EvalCaseFields } from "@devdigest/shared";

export const METRIC_KEYS = ["recall", "precision", "citation", "passed"] as const;

/** Starting fields of a case written by hand. */
export const NEW_CASE_FIELDS: EvalCaseFields = {
  name: "",
  input_diff: "",
  input_files: [],
  input_meta: { pr_number: 0, title: "", body: null },
  expected_output: { type: "must_find", items: [] },
};
