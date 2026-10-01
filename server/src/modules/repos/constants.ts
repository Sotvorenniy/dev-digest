/**
 * F1 — repos module constants (extracted from routes.ts; no behaviour change).
 */

/** JobRunner kind for the asynchronous `git clone` job. */
export const CLONE_JOB_KIND = 'clone';

/** Clone depth — shallow clone (latest commit only) keeps imports fast. */
export const CLONE_DEPTH = 1;

/**
 * Parse `owner`/`repo` from a GitHub URL — supports both
 * `https://github.com/owner/repo(.git)` and `git@github.com:owner/repo.git`.
 *
 * Anchored at the start on purpose. The previous form only required
 * `github.com[/:]` to appear *somewhere*, which made two things possible:
 * `https://evil.example.com/github.com/owner/repo` parsed as a GitHub repo, and
 * `https://github.com/../repo` yielded `owner = '..'` — and `owner` is a path
 * segment in `<cloneDir>/<owner>/<name>`, which the clone step `rm -rf`s before
 * writing. Owner is restricted to GitHub's login charset (alphanumerics and
 * interior hyphens), so a traversal segment cannot be expressed at all.
 *
 * The repo group allows dots so names like `next.js` parse; `parseRepoUrl`
 * rejects the `.`/`..` cases the charset alone still permits.
 */
export const GITHUB_URL_REGEX =
  /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;

/** The only host a repo may be imported from. */
export const GITHUB_HTTPS_HOST = 'github.com';

/** Prefix of the scp-like ssh form, which `new URL()` cannot parse. */
export const GIT_SSH_PREFIX = 'git@github.com:';
