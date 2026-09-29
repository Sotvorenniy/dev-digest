import type { ConventionCandidate, ConventionCandidateStatus, ConventionScanState } from '@devdigest/shared';

export type ConventionScanStatePatchStatus = 'queued' | 'running' | 'done' | 'failed';

export interface ConventionScanStatePatch {
  status: ConventionScanStatePatchStatus;
  sampledFileCount?: number;
  candidateCount?: number;
  error?: string | null;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface UpdateConventionCandidatePatch {
  status?: ConventionCandidateStatus;
  rule?: string;
  evidence_snippet?: string;
}

/**
 * A fresh `conventions` row for a kept, scored merged candidate — always
 * `status: 'pending'`. Lives here (core), not in the repository, so
 * `helpers.ts`'s pure `mergedCandidateToRow` transform can depend on it
 * without reaching into infrastructure (`repository.ts` depends INWARD on
 * this shape, not the other way around).
 */
export interface NewConventionRow {
  workspaceId: string;
  repoId: string;
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
  confidence: number;
  category: string | null;
  status: 'pending';
}

/** Port ConventionsService depends on — ConventionsRepository implements it.
 *  Speaks domain types only; row<->domain mapping happens inside the repository. */
export interface ConventionsRepositoryPort {
  /** Every candidate for the repo EXCEPT `status: 'rejected'` (server-side filter — checklist item 48). */
  listVisible(workspaceId: string, repoId: string): Promise<ConventionCandidate[]>;
  /** ALWAYS works — synthesises a `never_run` state when no scan has ever run. */
  getScanState(repoId: string): Promise<ConventionScanState>;
  /** Upsert (insert-or-merge) the repo's one scan-status row. */
  upsertScanState(repoId: string, patch: ConventionScanStatePatch): Promise<void>;
  /** Delete only `status: 'pending'` rows for the repo, then bulk-insert `rows` — accepted/rejected rows are untouched. */
  replacePendingCandidates(
    workspaceId: string,
    repoId: string,
    rows: NewConventionRow[],
  ): Promise<void>;
  updateCandidate(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: UpdateConventionCandidatePatch,
  ): Promise<ConventionCandidate | undefined>;
  /** Distinct evidence file paths of every `status: 'accepted'` candidate — feeds `Skill.evidence_files`. */
  getAcceptedWithFiles(workspaceId: string, repoId: string): Promise<string[]>;
  /** The repo's clone directory on disk, or `null` when it hasn't been cloned yet. */
  getRepoClonePath(repoId: string): Promise<string | null>;
}

/**
 * Port for attaching a freshly created skill to an agent. Implemented in the
 * composition root over the agents repository — the conventions module never
 * imports the agents module.
 */
export interface AgentSkillLinkerPort {
  /** Does this agent exist in the workspace? */
  hasAgent(workspaceId: string, agentId: string): Promise<boolean>;
  /** Append the skill at the END of the agent's skill order (idempotent). */
  appendSkill(agentId: string, skillId: string): Promise<void>;
}
