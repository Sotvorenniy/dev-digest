import type { CiFailOn, CiTarget, GitHubClient, Provider } from '@devdigest/shared';

/** An agent plus its linked skills (in order), as the CI export needs it. */
export interface CiAgent {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: 'auto' | 'single-pass' | 'map-reduce';
  ciFailOn: CiFailOn;
  skills: { name: string; body: string }[];
}

export interface CiInstallationRecord {
  id: string;
  agentId: string;
  repo: string;
  targetType: CiTarget;
  installedAt: Date;
  prUrl: string | null;
}

/** Port CiService depends on — CiRepository implements it. */
export interface CiRepositoryPort {
  /** Agent with its linked skills in order; `undefined` when not in the workspace. */
  getAgent(workspaceId: string, agentId: string): Promise<CiAgent | undefined>;
  isRepoImported(workspaceId: string, fullName: string): Promise<boolean>;
  /** Newest first. */
  listInstallations(agentId: string): Promise<CiInstallationRecord[]>;
  /** The agent that already owns CI for this repo in the workspace, if any. */
  findInstallationByRepo(
    workspaceId: string,
    repo: string,
  ): Promise<{ agentId: string; agentName: string } | undefined>;
  /** `undefined` when the repo row belongs to another agent. */
  upsertInstallation(v: {
    workspaceId: string;
    agentId: string;
    repo: string;
    targetType: 'gha';
    prUrl: string;
  }): Promise<CiInstallationRecord | undefined>;
}

/** GitHub methods the export uses; resolved lazily (throws `ConfigError` without a token). */
export type CiGitHubPort = () => Promise<
  Pick<GitHubClient, 'commitFiles' | 'findOpenPr' | 'openPullRequest'>
>;

/** The pre-built agent-runner bundle text (throws `ConfigError` when missing). */
export type RunnerBundlePort = () => Promise<string>;

export interface CiLogPort {
  info(obj: unknown, msg?: string): void;
}
