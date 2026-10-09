import { z } from 'zod';

// Minimal response schemas. Strip mode (never .strict()) so additive server
// changes stay safe; a renamed/removed field fails as ApiError('bad_response').
// Each comment names the server source of truth.

// server/src/vendor/shared/contracts/platform.ts:141 (Repo)
export const RepoLite = z.object({ id: z.string(), full_name: z.string() });
export type RepoLite = z.infer<typeof RepoLite>;

// server/src/vendor/shared/contracts/platform.ts:177 (PrMeta)
export const PrLite = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string().nullish(),
  status: z.string().nullish(),
});
export type PrLite = z.infer<typeof PrLite>;

// server/src/vendor/shared/contracts/knowledge.ts:211 (Agent), trimmed
export const AgentLite = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  enabled: z.boolean(),
});
export type AgentLite = z.infer<typeof AgentLite>;

// server/src/vendor/shared/contracts/review-api.ts:51 (ReviewRunTarget)
export const RunPostResponse = z.object({
  runs: z.array(
    z.object({ run_id: z.string(), agent_id: z.string(), agent_name: z.string().nullish() }),
  ),
});
export type RunPostResponse = z.infer<typeof RunPostResponse>;

// server/src/vendor/shared/contracts/trace.ts:103 (RunSummary)
export const RunLite = z.object({
  run_id: z.string(),
  agent_name: z.string().nullish(),
  status: z.string().nullish(),
  error: z.string().nullish(),
  score: z.number().nullish(),
  findings_count: z.number().nullish(),
  duration_ms: z.number().nullish(),
});
export type RunLite = z.infer<typeof RunLite>;

export const Severity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);
export type Severity = z.infer<typeof Severity>;

// server/src/vendor/shared/contracts/findings.ts:47 (Finding) + ReviewDtoFinding
// (server/src/modules/reviews/helpers.ts:30). `category` stays a plain string:
// a new category must not break the wrapper.
export const FindingLite = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string().nullish(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string().nullish(),
  suggestion: z.string().nullish(),
  confidence: z.number().nullish(),
  dismissed_at: z.string().nullish(),
});
export type FindingLite = z.infer<typeof FindingLite>;

// server/src/modules/reviews/helpers.ts:36 (ReviewDto)
export const ReviewLite = z.object({
  id: z.string(),
  run_id: z.string().nullish(),
  agent_id: z.string().nullish(),
  agent_name: z.string().nullish(),
  kind: z.string().nullish(),
  verdict: z.string().nullish(),
  score: z.number().nullish(),
  summary: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingLite),
});
export type ReviewLite = z.infer<typeof ReviewLite>;

// server/src/vendor/shared/contracts/knowledge.ts:160-187 (candidate + scan state)
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export const ConventionsResponse = z.object({
  candidates: z.array(
    z.object({
      id: z.string(),
      rule: z.string(),
      evidence_path: z.string(),
      evidence_start_line: z.number().int().nullish(),
      evidence_end_line: z.number().int().nullish(),
      confidence: z.number().nullish(),
      category: z.string().nullish(),
      status: ConventionStatus,
    }),
  ),
  scan: z.object({
    status: z.string(),
    candidate_count: z.number().nullish(),
    error: z.string().nullish(),
    finished_at: z.string().nullish(),
  }),
});
export type ConventionsResponse = z.infer<typeof ConventionsResponse>;

// server/src/vendor/shared/contracts/brief.ts:68-110 (BlastRadius). `degraded` and
// `degraded_reason` are nullish there, so they stay nullish here.
export const BlastLite = z.object({
  changed_symbols: z.array(z.object({ name: z.string(), file: z.string(), kind: z.string().nullish() })),
  downstream: z.array(
    z.object({
      symbol: z.string(),
      callers: z.array(z.object({ name: z.string(), file: z.string(), line: z.number().int() })),
      endpoints_affected: z.array(z.string()),
      crons_affected: z.array(z.string()),
    }),
  ),
  summary: z.string().nullish(),
  degraded: z.boolean().nullish(),
  degraded_reason: z.string().nullish(),
});
export type BlastLite = z.infer<typeof BlastLite>;
