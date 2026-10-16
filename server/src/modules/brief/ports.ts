import type { BlastRadius, IssueMeta, PrBrief, RepoRef, UnifiedDiff } from '@devdigest/shared';
import type { ProjectDocsPort } from '../../ports/project-docs.js';
import type { IntentRepositoryPort } from '../intent/ports.js';

/** The PR facts the brief reads from storage. */
export interface BriefPull {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  headSha: string;
  repo: { owner: string; name: string };
}

/** A changed file with its hunk headers only (never the patch body). */
export interface BriefFileRow {
  path: string;
  additions: number;
  deletions: number;
  hunks: string[];
}

/** Port BriefService depends on — BriefRepository implements it. */
export interface BriefRepositoryPort {
  /** `undefined` when the PR does not exist in the workspace. */
  findPull(workspaceId: string, prId: string): Promise<BriefPull | undefined>;
  listFiles(prId: string): Promise<BriefFileRow[]>;
  /** The diff rebuilt from stored patches, for grounding. */
  getDiff(prId: string): Promise<UnifiedDiff>;
  /** Spec paths attached to the repo's enabled agents, in stable order. */
  listEnabledAgentDocPaths(workspaceId: string, repoId: string): Promise<string[]>;
  /** `null` when there is no brief or the stored JSON no longer parses. */
  getBrief(prId: string): Promise<PrBrief | null>;
  saveBrief(prId: string, brief: PrBrief): Promise<void>;
}

/** Intent is read only; its single writer stays the intent module. */
export type BriefIntentPort = Pick<IntentRepositoryPort, 'getIntent'>;

export interface BriefBlastPort {
  get(workspaceId: string, prId: string): Promise<BlastRadius>;
}

export interface BriefIssuePort {
  getIssue(repo: RepoRef, n: number): Promise<IssueMeta>;
}

export type BriefDocsPort = Pick<ProjectDocsPort, 'read'>;

/** Structured stdout logger (pino-compatible). */
export interface BriefLogPort {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}
