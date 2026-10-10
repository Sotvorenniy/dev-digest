import type { ApiClient } from './api/client.js';
import { idPath } from './api/client.js';
import { AgentLite, PrLite, RepoLite } from './api/schemas.js';
import { z } from 'zod';
import { MAX_LISTED_REPOS } from './constants.js';
import { ToolError } from './errors.js';

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const PR_RE = /^\d{1,7}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RepoList = z.array(RepoLite);
const PrList = z.array(PrLite);
const AgentList = z.array(AgentLite);

export function validateRepo(repo: string): string {
  if (!REPO_RE.test(repo)) {
    throw new ToolError('repo must look like owner/name (see the git remote); fix the repo argument');
  }
  return repo;
}

export function validatePr(pr: number | string): number {
  const s = String(pr);
  if (!PR_RE.test(s)) throw new ToolError('pr must be a PR number (1-7 digits); fix the pr argument');
  return Number(s);
}

export async function resolveRepo(
  api: ApiClient,
  repo: string,
  signal?: AbortSignal,
): Promise<{ repoId: string; fullName: string }> {
  validateRepo(repo);
  const repos = await api.get('/repos', RepoList, signal);
  const hit = repos.find((r) => r.full_name.toLowerCase() === repo.toLowerCase());
  if (!hit) {
    const names = repos.slice(0, MAX_LISTED_REPOS).map((r) => r.full_name);
    const more = repos.length > names.length ? ', …' : '';
    throw new ToolError(
      `repo ${repo} not imported; imported: ${names.join(', ') || 'none'}${more}. Import it in DevDigest (web UI), then retry`,
    );
  }
  return { repoId: hit.id, fullName: hit.full_name };
}

export async function resolvePr(
  api: ApiClient,
  repo: string,
  pr: number | string,
  signal?: AbortSignal,
): Promise<{ prId: string; repoId: string }> {
  const number = validatePr(pr);
  const { repoId, fullName } = await resolveRepo(api, repo, signal);
  const pulls = await api.get(idPath('/repos', repoId, '/pulls'), PrList, signal);
  const hit = pulls.find((p) => p.number === number);
  if (!hit) throw new ToolError(`PR #${number} not found in ${fullName}; check the number (gh pr list)`);
  if (!hit.id) {
    throw new ToolError(`PR #${number} in ${fullName} is not imported yet; open it in dev-digest, then retry`);
  }
  return { prId: hit.id, repoId };
}

/** Exact uuid or case-insensitive name over GET /agents. */
export async function resolveAgent(
  api: ApiClient,
  nameOrId: string,
  signal?: AbortSignal,
): Promise<AgentLite> {
  const agents = await api.get('/agents', AgentList, signal);
  const needle = nameOrId.trim().toLowerCase();
  const hit = UUID_RE.test(nameOrId.trim())
    ? agents.find((a) => a.id.toLowerCase() === needle)
    : agents.find((a) => a.name.toLowerCase() === needle);
  if (!hit) {
    throw new ToolError(
      `agent not found; call list_agents. Known: ${agents.map((a) => a.name).slice(0, 20).join(', ') || 'none'}`,
    );
  }
  return hit;
}
