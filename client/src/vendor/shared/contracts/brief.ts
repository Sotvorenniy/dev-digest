import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

/** What kind of change the PR is, as judged by the intent classifier. */
export const IntentChangeType = z.enum([
  'feature',
  'bugfix',
  'refactor',
  'perf',
  'docs',
  'test',
  'chore',
  'other',
]);
export type IntentChangeType = z.infer<typeof IntentChangeType>;

/** `documented` = backed by author-written text; `inferred` = guessed from indirect signals. */
export const IntentBasis = z.enum(['documented', 'inferred']);
export type IntentBasis = z.infer<typeof IntentBasis>;

export const IntentSourceKind = z.enum([
  'title',
  'description',
  'branch',
  'commits',
  'files',
  'label',
  'issue',
  'ticket',
  'plan',
  'spec',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

/** One input the intent was derived from. `ref` never carries a URL query or a body. */
export const IntentSource = z.object({
  id: z.string(),
  kind: IntentSourceKind,
  ref: z.string(),
  fetched: z.boolean(),
  note: z.string().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/** Classifier output: the Intent plus change type, confidence, basis and spec requirements. */
export const IntentClassification = Intent.extend({
  change_type: IntentChangeType,
  confidence: z.number().min(0).max(1),
  basis: IntentBasis,
  requirements: z.array(z.string()).max(12).nullish(),
  /** Ids of the supplied sources the classifier actually relied on. */
  used_source_ids: z.array(z.string()).nullish(),
});
export type IntentClassification = z.infer<typeof IntentClassification>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  /** True when the index could not serve a full answer (flag off, partial index, ripgrep fallback). */
  degraded: z.boolean().nullish(),
  /** DegradedReason from repo-intel (`flag_off`, `index_failed`, ...); null/absent when not degraded. */
  degraded_reason: z.string().nullish(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk).max(8),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const BriefInputKind = z.enum(['intent', 'blast', 'specs', 'description', 'issue']);
export type BriefInputKind = z.infer<typeof BriefInputKind>;

export const BriefMissingReason = z.enum(['absent', 'stale', 'degraded', 'empty', 'unavailable']);
export type BriefMissingReason = z.infer<typeof BriefMissingReason>;

export const BriefMissingInput = z.object({
  input: BriefInputKind,
  reason: BriefMissingReason,
});
export type BriefMissingInput = z.infer<typeof BriefMissingInput>;

export const BriefReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int().min(1),
  reason: z.string(),
});
export type BriefReviewFocusItem = z.infer<typeof BriefReviewFocusItem>;

export const BriefTruncated = z.object({
  files: z.number().int().min(0),
  description: z.boolean(),
  issue_body: z.boolean().nullish(),
  callers: z.number().int().min(0).nullish(),
  blast_summary: z.boolean().nullish(),
});
export type BriefTruncated = z.infer<typeof BriefTruncated>;

export const BriefDropped = z.object({
  review_focus: z.number().int().min(0),
  risks: z.number().int().min(0),
  file_refs: z.number().int().min(0),
});
export type BriefDropped = z.infer<typeof BriefDropped>;

// Parsed from stored pr_brief.json — later fields must be `.nullish()`.
export const PrBrief = z.object({
  summary: z.string().nullish(),
  intent: Intent.nullable(),
  blast: BlastRadius.nullable(),
  risks: Risks,
  history: PrHistory.nullish(),
  review_focus: z.array(BriefReviewFocusItem).max(8).nullish(),
  head_sha: z.string().nullish(),
  /** ISO-8601 */
  generated_at: z.string().nullish(),
  missing_inputs: z.array(BriefMissingInput).nullish(),
  specs_used: z.array(z.string()).nullish(),
  truncated: BriefTruncated.nullish(),
  dropped: BriefDropped.nullish(),
  model: z.string().nullish(),
  tokens_in: z.number().int().nullish(),
  tokens_out: z.number().int().nullish(),
  cost_usd: z.number().nullish(),
});
export type PrBrief = z.infer<typeof PrBrief>;
