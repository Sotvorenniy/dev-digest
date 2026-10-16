import type { OnboardingTour } from '@devdigest/shared';
import type { RootFilesPort } from '../../ports/root-files.js';
import type { RepoIntel } from '../repo-intel/types.js';

/** The slice of a repo row the onboarding tour needs (domain shape, not a Drizzle row). */
export interface OnboardingRepoRef {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export interface OnboardingRepositoryPort {
  /** Workspace-scoped: null when the repo is not in this workspace. */
  findRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoRef | null>;
  /** Null when never generated, or when the stored JSON no longer parses. */
  getTour(repoId: string): Promise<OnboardingTour | null>;
  /** Insert or overwrite the single tour of a repo. */
  saveTour(repoId: string, tour: OnboardingTour): Promise<void>;
}

/** Read-only repo-intel facade slice. */
export type OnboardingRepoIntelPort = Pick<
  RepoIntel,
  'getIndexState' | 'hasIndexState' | 'getRankedFiles' | 'getFileFacts' | 'getCriticalPaths'
>;

export type OnboardingRootFilesPort = RootFilesPort;

export interface OnboardingJobPayload {
  workspaceId: string;
  repoId: string;
}

export interface OnboardingJobsPort {
  enqueue(workspaceId: string, payload: OnboardingJobPayload): Promise<{ id: string; done: Promise<void> }>;
}

/** Structured stdout logger (pino-compatible). Metadata only. */
export interface OnboardingLogPort {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}
