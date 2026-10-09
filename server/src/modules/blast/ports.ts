import type { RepoIntel } from '../repo-intel/types.js';

export interface BlastPullRef {
  id: string;
  repoId: string;
}

/** Port BlastService depends on — BlastRepository implements it. */
export interface BlastRepositoryPort {
  /** The PR in this workspace, or null when absent / owned by another workspace. */
  findPull(workspaceId: string, prId: string): Promise<BlastPullRef | null>;
  /** Paths of the files changed by the PR. */
  listFilePaths(prId: string): Promise<string[]>;
}

/** The only slice of the repo-intel facade the blast module reads. */
export type BlastIntelPort = Pick<RepoIntel, 'getBlastRadius'>;

/** Structured stdout logger (pino-compatible). */
export interface BlastLogger {
  info(obj: unknown, msg?: string): void;
}
