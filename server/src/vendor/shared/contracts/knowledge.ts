import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
// OnboardingTour is also the stored JSON (onboarding.json jsonb) — fields added
// after SPEC-02 must be `.nullish()`.
export const OnboardingIndexStatus = z.enum(['full', 'partial', 'degraded', 'failed']);
export type OnboardingIndexStatus = z.infer<typeof OnboardingIndexStatus>;

export const OnboardingOutcome = z.enum(['ai', 'skeleton']);
export type OnboardingOutcome = z.infer<typeof OnboardingOutcome>;

export const OnboardingSkeletonReason = z.enum([
  'index_degraded',
  'index_failed',
  'no_api_key',
  'ai_failed',
]);
export type OnboardingSkeletonReason = z.infer<typeof OnboardingSkeletonReason>;

export const OnboardingArchitectureNode = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string().nullable(),
});
export type OnboardingArchitectureNode = z.infer<typeof OnboardingArchitectureNode>;

export const OnboardingArchitectureEdge = z.object({
  from: z.string(),
  to: z.string(),
});
export type OnboardingArchitectureEdge = z.infer<typeof OnboardingArchitectureEdge>;

export const OnboardingCriticalPath = z.object({
  path: z.string(),
  why: z.string().nullable(),
});
export type OnboardingCriticalPath = z.infer<typeof OnboardingCriticalPath>;

export const OnboardingRunCommand = z.object({
  command: z.string(),
  note: z.string().nullable(),
  source: z.string(),
});
export type OnboardingRunCommand = z.infer<typeof OnboardingRunCommand>;

export const OnboardingReadingPathEntry = z.object({
  path: z.string(),
  reason: z.string().nullable(),
  score: z.number(),
});
export type OnboardingReadingPathEntry = z.infer<typeof OnboardingReadingPathEntry>;

export const OnboardingFirstTask = z.object({
  title: z.string(),
  why: z.string(),
  paths: z.array(z.string()).min(1),
});
export type OnboardingFirstTask = z.infer<typeof OnboardingFirstTask>;

export const OnboardingSections = z.object({
  architecture: z.object({
    summary: z.string().nullable(), // markdown, no raw HTML
    nodes: z.array(OnboardingArchitectureNode).max(12),
    edges: z.array(OnboardingArchitectureEdge),
  }),
  critical_paths: z.array(OnboardingCriticalPath).max(8),
  run_locally: z.array(OnboardingRunCommand),
  reading_path: z.array(OnboardingReadingPathEntry).max(10),
  first_tasks: z.array(OnboardingFirstTask).max(5),
});
export type OnboardingSections = z.infer<typeof OnboardingSections>;

export const OnboardingTour = z.object({
  generated_at: z.string(),
  indexed_sha: z.string(),
  files_indexed: z.number().int(),
  index_status: OnboardingIndexStatus,
  outcome: OnboardingOutcome,
  skeleton_reason: OnboardingSkeletonReason.nullable(),
  churn_available: z.boolean(),
  truncated: z.boolean(),
  dropped_paths: z.number().int(),
  model: z.string().nullable(),
  llm_calls: z.number().int().min(0).max(1),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  sections: OnboardingSections,
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingState = z.object({
  status: z.enum(['none', 'generating', 'ready']),
  job_id: z.string().nullable(),
  index: z.object({
    status: OnboardingIndexStatus,
    usable: z.boolean(),
    files_indexed: z.number().int(),
    last_indexed_sha: z.string().nullable(),
  }),
  is_stale: z.boolean(),
  tour: OnboardingTour.nullable(),
});
export type OnboardingState = z.infer<typeof OnboardingState>;

export const OnboardingGenerateResponse = z.object({
  status: z.literal('generating'),
  job_id: z.string(),
});
export type OnboardingGenerateResponse = z.infer<typeof OnboardingGenerateResponse>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'imported_file', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  /** Number of agents this skill is linked to (agent_skills rows). */
  agent_count: z.number().int(),
});
export type Skill = z.infer<typeof Skill>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// The immutable body snapshot captured in `skill_versions` whenever a skill's
// name/description/type/body changes (mirrors AgentVersion's shape/intent).
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  change_note: z.string().nullish(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

// ---- Conventions ----
export const ConventionCandidateStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionCandidateStatus = z.infer<typeof ConventionCandidateStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  evidence_start_line: z.number().int().nullish(),
  evidence_end_line: z.number().int().nullish(),
  confidence: z.number().min(0).max(1),
  /** Model-assigned topic (naming, error-handling, ...); null on pre-category rows. */
  category: z.string().nullish(),
  status: ConventionCandidateStatus,
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionScanStatus = z.enum(['never_run', 'queued', 'running', 'done', 'failed']);
export type ConventionScanStatus = z.infer<typeof ConventionScanStatus>;

export const ConventionScanState = z.object({
  repo_id: z.string(),
  status: ConventionScanStatus,
  sampled_file_count: z.number().int(),
  candidate_count: z.number().int(),
  error: z.string().nullish(),
  started_at: z.string().nullish(),
  finished_at: z.string().nullish(),
});
export type ConventionScanState = z.infer<typeof ConventionScanState>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
