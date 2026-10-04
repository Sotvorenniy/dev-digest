import type { SmartDiffRole } from '@devdigest/shared';

/** Reviewer reading order: what to read first -> what to skim last. */
export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

export interface ClassifyRule {
  role: Exclude<SmartDiffRole, 'core'>;
  /** The glob this regex implements (documentation; the regex is the truth). */
  glob: string;
  re: RegExp;
}

/**
 * Match order is the contract: first match wins, anything unmatched is `core`.
 * boilerplate -> tests -> wiring -> docs. Hence `__snapshots__/x.snap` is boilerplate
 * (not tests), and `e2e/README.md` / `.claude/**\/SKILL.md` are tests / wiring (not docs).
 *
 * Glob semantics: a directory glob without a `**\/` prefix is root-anchored; `**\/x/**`
 * matches at any depth; a bare filename glob matches the basename at any depth.
 * Every regex is anchored and linear (no nested quantifiers) — paths are PR-controlled.
 */
export const CLASSIFY_RULES: readonly ClassifyRule[] = [
  // ---- boilerplate ----
  { role: 'boilerplate', glob: '**/{pnpm-lock.yaml,package-lock.json,yarn.lock,Cargo.lock}', re: /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock)$/ },
  { role: 'boilerplate', glob: 'dist/**', re: /^dist\// },
  { role: 'boilerplate', glob: 'build/**', re: /^build\// },
  { role: 'boilerplate', glob: '**/*.generated.*', re: /(?:^|\/)[^/]*\.generated\.[^/]*$/ },
  { role: 'boilerplate', glob: '**/*.min.js', re: /\.min\.js$/ },
  { role: 'boilerplate', glob: '**/__snapshots__/**', re: /(?:^|\/)__snapshots__\// },
  { role: 'boilerplate', glob: '**/*.snap', re: /\.snap$/ },
  // ---- tests ----
  { role: 'tests', glob: '**/*.{test,spec}.*', re: /\.(?:test|spec)\.[^/]*$/ },
  { role: 'tests', glob: '**/__tests__/**', re: /(?:^|\/)__tests__\// },
  { role: 'tests', glob: '**/{test,tests}/**', re: /(?:^|\/)tests?\// },
  { role: 'tests', glob: 'e2e/**', re: /^e2e\// },
  // ---- wiring ----
  { role: 'wiring', glob: '.github/**', re: /^\.github\// },
  { role: 'wiring', glob: '.claude/**', re: /^\.claude\// },
  { role: 'wiring', glob: '**/index.{ts,tsx,js,jsx,mjs,cjs}', re: /(?:^|\/)index\.(?:tsx?|jsx?|mjs|cjs)$/ },
  { role: 'wiring', glob: '**/*.config.*', re: /(?:^|\/)[^/]*\.config\.[^/]*$/ },
  { role: 'wiring', glob: '**/tsconfig*.json', re: /(?:^|\/)tsconfig[^/]*\.json$/ },
  { role: 'wiring', glob: '**/.eslintrc*', re: /(?:^|\/)\.eslintrc[^/]*$/ },
  { role: 'wiring', glob: '**/.env*', re: /(?:^|\/)\.env[^/]*$/ },
  { role: 'wiring', glob: '**/docker-compose*.{yml,yaml}', re: /(?:^|\/)docker-compose[^/]*\.ya?ml$/ },
  // ---- docs ----
  { role: 'docs', glob: 'docs/**', re: /^docs\// },
  { role: 'docs', glob: '**/*.{md,mdx}', re: /\.mdx?$/ },
  { role: 'docs', glob: '**/{README,CHANGELOG,LICENSE}*', re: /(?:^|\/)(?:README|CHANGELOG|LICENSE)[^/]*$/ },
];
