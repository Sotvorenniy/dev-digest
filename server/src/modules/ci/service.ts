import type { CiExport, CiInstallation } from '@devdigest/shared';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import {
  CI_BRANCH_PREFIX,
  CI_COMMIT_MESSAGE,
  CI_PR_BODY,
  CI_PR_TITLE,
  type CiPostAs,
  type CiTrigger,
} from './constants.js';
import {
  CiProviderUnsupportedError,
  CiRateLimitedError,
  CiRepoHasOtherAgentError,
  buildCiFiles,
  requireSlug,
  toWireInstallation,
} from './domain.js';
import type {
  CiGitHubPort,
  CiLogPort,
  CiRepositoryPort,
  RunnerBundlePort,
} from './ports.js';

export interface CiServiceDeps {
  repo: CiRepositoryPort;
  github: CiGitHubPort;
  readRunnerBundle: RunnerBundlePort;
}

export interface CiExportRequest {
  repo: string;
  action: 'open_pr' | 'files';
  postAs: CiPostAs;
  triggers: CiTrigger[];
  base: string;
}

/** Map a failure from a GitHub call to the AppError taxonomy; no payload, no token. */
function mapGitHubError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const status = (err as { status?: number } | null)?.status;
  if (status === 429) return new CiRateLimitedError();
  return new ExternalServiceError(
    typeof status === 'number' ? `GitHub request failed (${status})` : 'GitHub request failed',
  );
}

export class CiService {
  constructor(private deps: CiServiceDeps) {}

  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    const agent = await this.deps.repo.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const records = await this.deps.repo.listInstallations(agentId);
    return records.map(toWireInstallation);
  }

  async exportCi(
    workspaceId: string,
    agentId: string,
    input: CiExportRequest,
    ctx: { logger: CiLogPort },
  ): Promise<CiExport> {
    let outcome = 'ok';
    try {
      return await this.run(workspaceId, agentId, input);
    } catch (err) {
      outcome = err instanceof AppError ? err.code : 'error';
      throw err;
    } finally {
      ctx.logger.info(
        { agent_id: agentId, repo: input.repo, action: input.action, outcome },
        'ci export',
      );
    }
  }

  private async run(workspaceId: string, agentId: string, input: CiExportRequest): Promise<CiExport> {
    const { repo: repoPort } = this.deps;

    const agent = await repoPort.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    if (agent.provider !== 'openrouter') throw new CiProviderUnsupportedError();
    if (!(await repoPort.isRepoImported(workspaceId, input.repo))) {
      throw new NotFoundError('Repo not found');
    }
    const owner = await repoPort.findInstallationByRepo(workspaceId, input.repo);
    if (owner && owner.agentId !== agent.id) throw new CiRepoHasOtherAgentError(owner.agentName);

    const bundle = await this.deps.readRunnerBundle();
    const slug = requireSlug(agent.name, 'agent');
    const files = buildCiFiles({
      agent,
      bundle,
      triggers: input.triggers,
      postAs: input.postAs,
    });

    if (input.action === 'files') {
      return {
        installation: {
          id: '',
          agent_id: agent.id,
          repo: input.repo,
          target_type: 'gha',
          installed_at: new Date().toISOString(),
          pr_url: null,
        },
        files,
        pr_url: null,
      };
    }

    const [owner_, name] = input.repo.split('/') as [string, string];
    const ref = { owner: owner_, name };
    const branch = `${CI_BRANCH_PREFIX}${slug}`;

    let prUrl: string;
    try {
      const gh = await this.deps.github();
      await gh.commitFiles(ref, {
        branch,
        base: input.base,
        message: CI_COMMIT_MESSAGE,
        files: files.map((f) => ({ path: f.path, contents: f.contents })),
      });
      const existing = await gh.findOpenPr(ref, branch);
      const pr =
        existing ??
        (await gh.openPullRequest(ref, {
          title: CI_PR_TITLE,
          head: branch,
          base: input.base,
          body: CI_PR_BODY,
        }));
      prUrl = pr.url;
    } catch (err) {
      throw mapGitHubError(err);
    }

    const record = await repoPort.upsertInstallation({
      workspaceId,
      agentId: agent.id,
      repo: input.repo,
      targetType: 'gha',
      prUrl,
    });
    if (!record) {
      // Lost a race: another agent claimed the repo after our guard.
      const now = await repoPort.findInstallationByRepo(workspaceId, input.repo);
      throw new CiRepoHasOtherAgentError(now?.agentName ?? 'another agent');
    }
    return { installation: toWireInstallation(record), files, pr_url: prUrl };
  }
}
