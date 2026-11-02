import { CI_PATHS, type CiPostAs, type CiTrigger } from './constants.js';

/**
 * Fixed GitHub Actions workflow. Only values from the `CI_TRIGGERS` / `CI_POST_AS`
 * enums are interpolated (the caller validates them); secrets appear by name only.
 * Fork PRs are skipped: they get no secrets.
 */
export function renderWorkflow(opts: { triggers: CiTrigger[]; postAs: CiPostAs }): string {
  return `name: DevDigest review

on:
  pull_request:
    types: [${opts.triggers.join(', ')}]

permissions:
  contents: read
  pull-requests: write

env:
  DEVDIGEST_POST_AS: ${opts.postAs}
  PR_NUMBER: \${{ github.event.pull_request.number }}

jobs:
  review:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run DevDigest review
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: node ${CI_PATHS.runner}
`;
}
