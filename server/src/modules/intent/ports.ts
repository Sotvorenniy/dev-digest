import type { GitClient, GitHubClient, IntentSource, PrIntentRecord } from '@devdigest/shared';
import type { DocFetcher } from '../../ports/doc-fetcher.js';

/** The PR facts the intent layer reads from storage. */
export interface IntentPullInfo {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  headSha: string;
  body: string | null;
}

export interface IntentRepoInfo {
  owner: string;
  name: string;
}

/** A persisted intent, ready to write (the repository stamps timestamps). */
export interface IntentWrite {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  changeType: string;
  confidence: number;
  basis: 'documented' | 'inferred';
  sources: IntentSource[];
  requirements: string[];
  provider: string;
  model: string;
  headSha: string;
  inputsHash: string;
}

/** Port IntentService depends on — IntentRepository implements it. Workspace-scoped. */
export interface IntentRepositoryPort {
  getPull(workspaceId: string, prId: string): Promise<IntentPullInfo | undefined>;
  getRepo(repoId: string): Promise<IntentRepoInfo | undefined>;
  /** First line of each commit message, in stored order. */
  listCommitSubjects(prId: string): Promise<string[]>;
  /** Changed files with their hunk headers only (never patch bodies). */
  listFiles(prId: string): Promise<{ path: string; hunks: string[] }[]>;
  /** `undefined` when no intent was ever derived (or the PR is in another workspace). */
  getIntent(workspaceId: string, prId: string): Promise<(PrIntentRecord & { inputs_hash: string | null }) | undefined>;
  upsertIntent(values: IntentWrite): Promise<void>;
}

/** The GitHub calls the intent layer needs (a slice of the shared `GitHubClient`). */
export type IntentGitHubPort = Pick<GitHubClient, 'getPullRequest' | 'getIssue'>;

/** The git call the intent layer needs (a slice of the shared `GitClient`). */
export type IntentGitPort = Pick<GitClient, 'readFile'>;

export type { DocFetcher };

/** Where intent progress is reported: the Live Log (RunLogger satisfies this) or nothing. */
export interface IntentLogPort {
  info(msg: string, data?: unknown): void;
  tool(msg: string, data?: unknown): void;
  result(msg: string, data?: unknown): void;
}

/** Structured stdout logger (pino-compatible). Cost is reported here only. */
export interface IntentStdLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

/** What other modules (the review run executor) need from the intent layer: derive only. */
export interface IntentDerivePort {
  derive(
    workspaceId: string,
    prId: string,
    ctx?: { force?: boolean; log?: IntentLogPort; logger?: IntentStdLogger; correlationId?: string },
  ): Promise<{ record: PrIntentRecord; cached: boolean }>;
}
