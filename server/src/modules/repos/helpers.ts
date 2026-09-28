import { type Repo } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { AppError } from '../../platform/errors.js';
import { GITHUB_URL_REGEX, GITHUB_HTTPS_HOST, GIT_SSH_PREFIX } from './constants.js';

/**
 * F1 — repos pure helpers (extracted from routes.ts; no behaviour change).
 * Pure functions only — no I/O, no DB, no container.
 */

/**
 * Parse `owner`/`name` from a GitHub URL (https or ssh form).
 *
 * Both values become path segments under the clone directory, so they are
 * treated as untrusted input rather than as parse output: the regex is anchored
 * and charset-limited, and the `.`/`..` check below closes the one traversal
 * spelling the repo-name charset still allows.
 */
export function parseRepoUrl(url: string): { owner: string; name: string } {
  assertGitHubHost(url);

  // https://github.com/owner/repo(.git)  |  git@github.com:owner/repo.git
  const match = url.match(GITHUB_URL_REGEX);
  if (!match?.[1] || !match[2]) {
    throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
  }
  const owner = match[1];
  const name = match[2];
  if (TRAVERSAL_SEGMENTS.has(owner) || TRAVERSAL_SEGMENTS.has(name)) {
    throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
  }
  return { owner, name };
}

/** Path segments that would escape or re-enter the clone directory. */
const TRAVERSAL_SEGMENTS = new Set(['.', '..']);

/**
 * Reject anything that is not a github.com https URL before it can reach `git`.
 *
 * `GITHUB_URL_REGEX` already implies this, but the host rule is the one that
 * matters for what the *server* will go and fetch — `RepoInput.url` is only
 * `z.string().url()`, which accepts any scheme and host, so without this the
 * import endpoint is a general-purpose "make my server fetch this remote"
 * primitive (internal hosts over https, local files over `file://`). Stated
 * separately so the failure says which rule was broken.
 */
function assertGitHubHost(url: string): void {
  if (url.startsWith(GIT_SSH_PREFIX)) return; // git@github.com:owner/repo.git
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('invalid_repo_url', `'${url}' is not a valid URL`, 400);
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== GITHUB_HTTPS_HOST) {
    throw new AppError(
      'invalid_repo_url',
      `Only https://${GITHUB_HTTPS_HOST} repositories are supported (got '${parsed.protocol}//${parsed.hostname}')`,
      400,
    );
  }
}

/** Map a persisted repo row to the API `Repo` DTO. */
export function toRepoDto(row: typeof t.repos.$inferSelect): Repo {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    owner: row.owner,
    name: row.name,
    full_name: row.fullName,
    default_branch: row.defaultBranch,
    clone_path: row.clonePath,
    last_polled_at: row.lastPolledAt?.toISOString() ?? null,
    created_by: row.createdBy,
  };
}
