import type {
  EvalCaseResult,
  EvalExpectedOutput,
  EvalInputMeta,
  EvalSetRunStatus,
  FindingCategory,
  LLMProvider,
  Provider,
  Severity,
} from '@devdigest/shared';

/** A decided-or-not finding with the PR facts and the stored patch of its file. */
export interface EvalFindingSource {
  findingId: string;
  file: string;
  startLine: number;
  endLine: number;
  title: string;
  severity: Severity;
  category: FindingCategory;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
  /** The review's agent; `null` for reviews with no agent. */
  reviewAgentId: string | null;
  prNumber: number;
  prTitle: string;
  prBody: string | null;
  /** `null` when the `pr_files` row or its patch is missing. */
  filePatch: string | null;
}

/** Domain form of an `eval_cases` row. */
export interface EvalCaseRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: EvalInputMeta;
  expected: EvalExpectedOutput;
  sourceFindingId: string | null;
  notes: string | null;
  /** The source finding's current decision; `null` when the finding is gone or there is none. */
  sourceDecision: { acceptedAt: Date | null; dismissedAt: Date | null } | null;
}

export interface NewEvalCase {
  workspaceId: string;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: EvalInputMeta;
  expected: EvalExpectedOutput;
  sourceFindingId: string;
}

/** The editable fields of a saved case. Owner and source finding never change. */
export interface EvalCasePatch {
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: EvalInputMeta;
  expected: EvalExpectedOutput;
}

/** The case inputs frozen at run start (EC8: later edits never change a running run). */
export interface EvalCaseSnapshot {
  id: string;
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: EvalInputMeta;
  expected: EvalExpectedOutput;
}

/** Domain form of an `eval_set_runs` row. */
export interface EvalSetRunRecord {
  id: string;
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  provider: Provider;
  model: string;
  strategy: string;
  systemPrompt: string;
  status: EvalSetRunStatus;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  casesTotal: number;
  casesPassed: number;
  casesErrored: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
  durationMs: number | null;
  results: EvalCaseResult[];
}

/** A run summary (no `results` / `systemPrompt`) joined to its agent's name. */
export interface EvalRecentRunRecord extends EvalSetRunRecord {
  agentName: string;
}

/** An agent that owns at least one eval case. */
export interface EvalAgentCaseCount {
  agentId: string;
  name: string;
  model: string;
  casesTotal: number;
}

export interface StartEvalRun {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  provider: Provider;
  model: string;
  strategy: string;
  systemPrompt: string;
  caseSet: EvalCaseSnapshot[];
}

export interface CompleteEvalRun {
  status: Exclude<EvalSetRunStatus, 'running'>;
  error?: string | null;
  casesTotal: number;
  casesPassed: number;
  casesErrored: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
  durationMs: number | null;
  results: EvalCaseResult[];
}

/** Port EvalService depends on — EvalRepository implements it. */
export interface EvalRepositoryPort {
  /** `undefined` when the finding does not exist in the workspace. */
  findFindingSource(workspaceId: string, findingId: string): Promise<EvalFindingSource | undefined>;
  findCaseBySourceFinding(workspaceId: string, findingId: string): Promise<EvalCaseRecord | undefined>;
  /** Insert-or-return: a lost race on the source-finding unique index returns the existing row with `created: false`. */
  insertCase(values: NewEvalCase): Promise<{ record: EvalCaseRecord; created: boolean }>;
  listCases(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]>;
  /** A case written by hand, with no source finding. */
  insertManualCase(values: Omit<NewEvalCase, 'sourceFindingId'>): Promise<EvalCaseRecord>;
  /** The updated case, or `undefined` when no such case exists in the workspace. */
  updateCase(workspaceId: string, caseId: string, patch: EvalCasePatch): Promise<EvalCaseRecord | undefined>;
  /** `false` when no such case exists in the workspace. */
  deleteCase(workspaceId: string, caseId: string): Promise<boolean>;
  countCases(workspaceId: string, agentId: string): Promise<number>;
  /** Throws `EvalRunActiveError` when the agent already has a running run. */
  startRun(values: StartEvalRun): Promise<EvalSetRunRecord>;
  hasRunningRun(agentId: string): Promise<boolean>;
  completeRun(runId: string, patch: CompleteEvalRun): Promise<void>;
  getRun(workspaceId: string, runId: string): Promise<EvalSetRunRecord | undefined>;
  /** Newest first. */
  listRuns(workspaceId: string, agentId: string, limit: number): Promise<EvalSetRunRecord[]>;
  /** Each case's most recent result across the agent's finished runs. */
  latestCaseStatuses(workspaceId: string, agentId: string): Promise<Map<string, 'pass' | 'fail' | 'error'>>;
  /** Agents with at least one case, with their case counts; agents without cases are excluded. */
  listAgentsWithCases(workspaceId: string): Promise<EvalAgentCaseCount[]>;
  /** Summary runs (no `results` / `systemPrompt`), newest first by finish-or-start time. */
  listRunSummaries(
    workspaceId: string,
    opts?: { agentIds?: string[]; limit?: number },
  ): Promise<EvalSetRunRecord[]>;
  /** Each agent's newest `perAgent` finished (`done`/`partial`) summary runs, newest first overall. */
  listFinishedRunsPerAgent(
    workspaceId: string,
    agentIds: string[],
    perAgent: number,
  ): Promise<EvalSetRunRecord[]>;
  /** Newest runs across the workspace with the agent name, newest first. */
  listRecentRuns(workspaceId: string, limit: number): Promise<EvalRecentRunRecord[]>;
  /** Marks every `running` run `failed` with `reason`; returns how many. */
  failRunningRuns(reason: string): Promise<number>;
}

export interface EvalAgent {
  id: string;
  name: string;
  version: number;
  provider: Provider;
  model: string;
  strategy: string;
  systemPrompt: string;
}

export interface EvalAgentsPort {
  getAgent(workspaceId: string, id: string): Promise<EvalAgent | undefined>;
}

/** A provider that makes exactly one HTTP request per structured call. */
export type EvalLlmPort = (provider: Provider) => Promise<LLMProvider>;

/** Structured stdout logger (pino-compatible). */
export interface EvalLogPort {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}
