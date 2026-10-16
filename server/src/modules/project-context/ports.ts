import type { ProjectContextEntry } from '@devdigest/shared';

export type ContextOwnerKind = 'agent' | 'skill';

export interface ContextRepoRef {
  id: string;
  owner: string;
  name: string;
  /** Branch the clone tracks; set by `findRepo`, absent on run-time refs. */
  defaultBranch?: string;
}

/** Brings a repo clone up to date with its remote branch (GitClient.sync implements it). */
export interface ContextClonePort {
  sync(repo: ContextRepoRef, branch: string): Promise<unknown>;
}

/** Port ProjectContextService depends on — ProjectContextRepository implements it. */
export interface ProjectContextRepositoryPort {
  /** The repo in this workspace, or null when absent / owned by another workspace. */
  findRepo(workspaceId: string, repoId: string): Promise<ContextRepoRef | null>;
  agentExists(workspaceId: string, agentId: string): Promise<boolean>;
  skillExists(workspaceId: string, skillId: string): Promise<boolean>;
  /** Attached paths of one agent/skill in one repo, in attach order. */
  listPaths(kind: ContextOwnerKind, ownerId: string, repoId: string): Promise<string[]>;
  /** Replaces the attached paths of one agent/skill in one repo (other repos untouched). */
  replacePaths(kind: ContextOwnerKind, ownerId: string, repoId: string, paths: string[]): Promise<void>;
  /** Distinct agents using each path in this repo, directly or via a linked skill. */
  usedByAgents(repoId: string): Promise<Map<string, number>>;
  /** Attached paths per skill in one repo, in attach order. */
  skillPaths(skillIds: string[], repoId: string): Promise<Map<string, string[]>>;
}

export interface ProjectContextForRun {
  specs: { label: string; text: string }[];
  entries: ProjectContextEntry[];
  specsRead: string[];
  includedTokens: number;
}

/** The only slice of the module the run executor may see. */
export interface ProjectContextRunPort {
  resolveForRun(input: {
    workspaceId: string;
    repo: ContextRepoRef;
    agentId: string;
    skills: { id: string; name: string }[];
  }): Promise<ProjectContextForRun>;
}
