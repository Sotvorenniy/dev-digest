import type {
  ContextAttachments,
  ContextAttachmentsSaved,
  ProjectContextFile,
  ProjectContextList,
} from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import {
  CONTEXT_MAX_ATTACHMENTS,
  checkContextPathSyntax,
  estimateTokens,
  docTypeFor,
  matchesRoots,
  type DocRead,
  type ProjectDocsPort,
} from '../../ports/project-docs.js';
import {
  AttachmentLimitError,
  CloneUnavailableError,
  ContextDocNotFoundError,
  ContextDocTooLargeError,
  ContextPathInvalidError,
  RepoNotFoundError,
  buildProjectContext,
  groupCandidates,
  orderCandidates,
} from './domain.js';
import type {
  ContextClonePort,
  ContextOwnerKind,
  ContextRepoRef,
  ProjectContextForRun,
  ProjectContextRepositoryPort,
  ProjectContextRunPort,
} from './ports.js';

export interface ProjectContextDeps {
  repo: ProjectContextRepositoryPort;
  docs: ProjectDocsPort;
  clone: ContextClonePort;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lists/previews repo docs, stores per-repo attachments, and resolves them for a run. */
export class ProjectContextService implements ProjectContextRunPort {
  constructor(private readonly deps: ProjectContextDeps) {}

  private async requireRepo(workspaceId: string, repoId: string): Promise<ContextRepoRef> {
    // Not a uuid → cannot exist; avoids a DB cast error.
    const repo = UUID_RE.test(repoId) ? await this.deps.repo.findRepo(workspaceId, repoId) : null;
    if (!repo) throw new RepoNotFoundError();
    return repo;
  }

  private async requireOwner(kind: ContextOwnerKind, workspaceId: string, ownerId: string): Promise<void> {
    const ok =
      kind === 'agent'
        ? await this.deps.repo.agentExists(workspaceId, ownerId)
        : await this.deps.repo.skillExists(workspaceId, ownerId);
    if (!ok) throw new NotFoundError(`${kind} not found`);
  }

  async listDocs(workspaceId: string, repoId: string): Promise<ProjectContextList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const scan = await this.deps.docs.list(repo);
    if (scan.kind === 'clone_unavailable') throw new CloneUnavailableError();
    const usedBy = await this.deps.repo.usedByAgents(repo.id);
    const docs = scan.docs.map((d) => ({
      path: d.path,
      type: d.type,
      size_bytes: d.sizeBytes,
      tokens: d.tokens,
      used_by_agents: usedBy.get(d.path) ?? 0,
      updated_at: d.updatedAt,
    }));
    return {
      docs,
      total_tokens: docs.reduce((n, d) => n + d.tokens, 0),
      search_roots: [...this.deps.docs.roots],
      truncated: scan.truncated,
    };
  }

  /**
   * Pulls the clone up to its remote default branch, then rescans. A failed
   * sync (no network, no clone yet) answers 409 like a missing clone.
   */
  async reindex(workspaceId: string, repoId: string): Promise<ProjectContextList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    try {
      await this.deps.clone.sync(repo, repo.defaultBranch ?? 'main');
    } catch {
      throw new CloneUnavailableError('repository clone could not be synced');
    }
    return this.listDocs(workspaceId, repoId);
  }

  async getDoc(workspaceId: string, repoId: string, path: string): Promise<ProjectContextFile> {
    const repo = await this.requireRepo(workspaceId, repoId);
    // Reject before any fs call.
    if (!checkContextPathSyntax(path) || !matchesRoots(path, this.deps.docs.roots)) {
      throw new ContextPathInvalidError();
    }
    const read = await this.deps.docs.read(repo, path);
    switch (read.kind) {
      case 'ok': {
        const usedBy = await this.deps.repo.usedByAgents(repo.id);
        return {
          path,
          type: docTypeFor(path, this.deps.docs.roots),
          size_bytes: read.sizeBytes,
          tokens: estimateTokens(read.text),
          used_by_agents: usedBy.get(path) ?? 0,
          updated_at: read.updatedAt,
          content: read.text,
        };
      }
      case 'invalid':
      case 'not_utf8':
        throw new ContextPathInvalidError();
      case 'missing':
        throw new ContextDocNotFoundError();
      case 'too_large':
        throw new ContextDocTooLargeError();
      case 'clone_unavailable':
        throw new CloneUnavailableError();
    }
  }

  async getAttachments(
    kind: ContextOwnerKind,
    workspaceId: string,
    ownerId: string,
    repoId: string,
  ): Promise<ContextAttachments> {
    await this.requireOwner(kind, workspaceId, ownerId);
    const repo = await this.requireRepo(workspaceId, repoId);
    const paths = await this.deps.repo.listPaths(kind, ownerId, repo.id);
    const missing: string[] = [];
    for (const p of paths) {
      if ((await this.deps.docs.exists(repo, p)) !== 'ok') missing.push(p);
    }
    return { repo_id: repo.id, paths, missing };
  }

  async setAttachments(
    kind: ContextOwnerKind,
    workspaceId: string,
    ownerId: string,
    input: { repo_id: string; paths: string[] },
  ): Promise<ContextAttachmentsSaved> {
    await this.requireOwner(kind, workspaceId, ownerId);
    const repo = await this.requireRepo(workspaceId, input.repo_id);
    const { paths } = input;

    if (paths.length > CONTEXT_MAX_ATTACHMENTS) {
      throw new AttachmentLimitError(`at most ${CONTEXT_MAX_ATTACHMENTS} paths can be attached`);
    }
    if (new Set(paths).size !== paths.length) {
      throw new AttachmentLimitError('paths must be unique');
    }
    for (const p of paths) {
      if (!checkContextPathSyntax(p) || !matchesRoots(p, this.deps.docs.roots)) {
        throw new ContextPathInvalidError();
      }
      // A path that does not exist yet is accepted (kept as a "missing" row);
      // one that resolves outside the allowed set is not.
      if ((await this.deps.docs.exists(repo, p)) === 'invalid') throw new ContextPathInvalidError();
    }

    await this.deps.repo.replacePaths(kind, ownerId, repo.id, paths);
    return { repo_id: repo.id, paths };
  }

  async resolveForRun(input: {
    workspaceId: string;
    repo: ContextRepoRef;
    agentId: string;
    skills: { id: string; name: string }[];
  }): Promise<ProjectContextForRun> {
    const { repo, docs } = this.deps;
    const agentPaths = await repo.listPaths('agent', input.agentId, input.repo.id);
    const byskill = await repo.skillPaths(
      input.skills.map((s) => s.id),
      input.repo.id,
    );
    const candidates = groupCandidates(
      orderCandidates(
        agentPaths,
        input.skills.map((s) => ({ name: s.name, paths: byskill.get(s.id) ?? [] })),
      ),
      (path) => docTypeFor(path, docs.roots),
    );
    const reads = new Map<string, DocRead>();
    for (const c of candidates) {
      try {
        reads.set(c.path, await docs.read(input.repo, c.path));
      } catch {
        reads.set(c.path, { kind: 'missing' });
      }
    }
    return buildProjectContext(candidates, reads);
  }
}
