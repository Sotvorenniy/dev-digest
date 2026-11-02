export const CI_PATHS = {
  agentsDir: '.devdigest/agents/',
  skillsDir: '.devdigest/skills/',
  runner: '.devdigest/runner/index.js',
  workflow: '.github/workflows/devdigest-review.yml',
} as const;

export const CI_BRANCH_PREFIX = 'devdigest/ci-';
export const CI_PR_TITLE = 'Add DevDigest CI review';
export const CI_COMMIT_MESSAGE = 'ci: add DevDigest review workflow';
export const CI_PR_BODY =
  'Adds the DevDigest review agent to GitHub Actions.\n\n' +
  'Before merging, add the `OPENROUTER_API_KEY` repository secret (Settings > Secrets and variables > Actions).\n\n' +
  'Trust model: the workflow runs the runner from the pull request branch with this secret available. ' +
  'Anyone with write access to the repository can change that runner in a pull request, so grant write access accordingly. ' +
  'Pull requests from forks are skipped.';

export const CI_TRIGGERS = ['opened', 'synchronize', 'reopened'] as const;
export type CiTrigger = (typeof CI_TRIGGERS)[number];

export const CI_POST_AS = ['github_review', 'pr_comment', 'none'] as const;
export type CiPostAs = (typeof CI_POST_AS)[number];

export const CI_EXPORT_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const SAFE_PATH_ROOTS = ['.devdigest/', '.github/workflows/'] as const;
