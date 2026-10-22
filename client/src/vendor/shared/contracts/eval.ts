import { z } from 'zod';
import { Severity, FindingCategory } from './findings.js';

// ---- Eval pipeline: per-agent cases, set runs, per-case results ----

export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;

export const EvalExpectationItem = z
  .object({
    file: z.string(),
    start_line: z.number().int().min(1),
    end_line: z.number().int(),
    title: z.string(),
    severity: Severity,
    category: FindingCategory,
  })
  .refine((v) => v.end_line >= v.start_line, {
    message: 'end_line must be >= start_line',
    path: ['end_line'],
  });
export type EvalExpectationItem = z.infer<typeof EvalExpectationItem>;

export const EvalExpectedOutput = z.object({
  type: EvalExpectationType,
  items: z.array(EvalExpectationItem),
});
export type EvalExpectedOutput = z.infer<typeof EvalExpectedOutput>;

export const EvalInputMeta = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
});
export type EvalInputMeta = z.infer<typeof EvalInputMeta>;

export const EvalCaseStatus = z.enum(['pass', 'fail', 'error', 'never_run']);
export type EvalCaseStatus = z.infer<typeof EvalCaseStatus>;

export const EvalCase = z.object({
  id: z.string().uuid(),
  owner_kind: z.literal('agent'),
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.array(z.string()),
  input_meta: EvalInputMeta,
  expected_output: EvalExpectedOutput,
  source_finding_id: z.string().nullable(),
  decision_changed: z.boolean(),
  last_status: EvalCaseStatus,
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

export const CreateEvalCaseBody = z.object({
  agent_id: z.string().uuid().optional(),
});
export type CreateEvalCaseBody = z.infer<typeof CreateEvalCaseBody>;

export const EvalSetRunStatus = z.enum(['running', 'done', 'partial', 'failed']);
export type EvalSetRunStatus = z.infer<typeof EvalSetRunStatus>;

export const EvalSetRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_version: z.number().int(),
  model: z.string(),
  strategy: z.string(),
  status: EvalSetRunStatus,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_passed: z.number().int(),
  cases_errored: z.number().int(),
  recall: z.number().min(0).max(1).nullable(),
  precision: z.number().min(0).max(1).nullable(),
  citation_accuracy: z.number().min(0).max(1).nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
});
export type EvalSetRun = z.infer<typeof EvalSetRun>;

export const EvalKeptFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  severity: Severity,
  category: FindingCategory,
  is_noise: z.boolean(),
});
export type EvalKeptFinding = z.infer<typeof EvalKeptFinding>;

export const EvalDroppedFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  reason: z.string(),
});
export type EvalDroppedFinding = z.infer<typeof EvalDroppedFinding>;

// Persisted as jsonb and parsed back: any field added later must be `.nullish()`.
export const EvalCaseResult = z.object({
  case_id: z.string().nullable(),
  case_name: z.string(),
  expectation_type: EvalExpectationType,
  status: z.enum(['pass', 'fail', 'error']),
  error: z.string().nullable(),
  kept: z.array(EvalKeptFinding),
  dropped: z.array(EvalDroppedFinding),
  matched_items: z.number().int(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

export const EvalSetRunDetail = EvalSetRun.extend({
  system_prompt: z.string(),
  results: z.array(EvalCaseResult),
});
export type EvalSetRunDetail = z.infer<typeof EvalSetRunDetail>;

export const EvalAgentSummary = z.object({
  agent_id: z.string(),
  name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  latest: EvalSetRun.nullable(),
  recall_series: z.array(z.number()),
});
export type EvalAgentSummary = z.infer<typeof EvalAgentSummary>;

export const EvalRecentRun = EvalSetRun.extend({ agent_name: z.string() });
export type EvalRecentRun = z.infer<typeof EvalRecentRun>;

export const EvalWorkspaceDashboard = z.object({
  agents: z.array(EvalAgentSummary),
  recent_runs: z.array(EvalRecentRun),
});
export type EvalWorkspaceDashboard = z.infer<typeof EvalWorkspaceDashboard>;

export const EvalMetricPoint = z.object({
  run_id: z.string(),
  finished_at: z.string(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
});
export type EvalMetricPoint = z.infer<typeof EvalMetricPoint>;

export const EvalAgentDashboard = z.object({
  agent_id: z.string(),
  name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  latest: EvalSetRun.nullable(),
  previous: EvalSetRun.nullable(),
  trend: z.array(EvalMetricPoint),
  runs: z.array(EvalSetRun),
});
export type EvalAgentDashboard = z.infer<typeof EvalAgentDashboard>;
