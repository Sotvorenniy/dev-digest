import type { FastifyReply } from 'fastify';
import type { SecretsProvider } from '@devdigest/shared';
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';
import { ConfigError, NotFoundError } from '../../platform/errors.js';
import { DEFAULT_THRESHOLDS } from './constants.js';
import { assessHealth, type RepoHealth } from './domain.js';
import type { RepoHealthRepositoryPort } from './ports.js';

export interface RepoHealthDeps {
  repo: RepoHealthRepositoryPort;
  secrets: SecretsProvider;
}

export class RepoHealthService {
  constructor(private readonly deps: RepoHealthDeps) {}

  async health(workspaceId: string, repoId: string, reply: FastifyReply): Promise<RepoHealth | undefined> {
    const repo = await this.deps.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    if (repo.lastPolledAt === null) {
      reply.code(409).send({ error: { code: 'repo_not_polled', message: 'Repository has never been polled' } });
      return undefined;
    }

    const token = await this.deps.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not set');
    const github = new OctokitGitHubClient(token);
    const pulls = await github.listPullRequests({ owner: repo.owner, name: repo.name });

    return assessHealth(
      {
        repoId: repo.id,
        openedAt: pulls.map((p) => (p.opened_at ? new Date(p.opened_at) : null)),
        lastPolledAt: repo.lastPolledAt,
        now: new Date(),
      },
      DEFAULT_THRESHOLDS,
    );
  }
}
