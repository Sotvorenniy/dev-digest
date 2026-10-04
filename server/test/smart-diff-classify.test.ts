/**
 * `modules/smart-diff/domain.ts` classifyFile — path -> role table.
 *
 * Glob semantics (documented here because the table below relies on them):
 *   - a directory glob WITHOUT a `**` prefix is root-anchored: `dist/**`, `build/**`,
 *     `e2e/**`, `docs/**`, `.github/**`, `.claude/**` only match at the repo root
 *     (so `src/build/util.ts` stays core);
 *   - `**` + `/x/**` matches `x` at any depth (`__tests__`, `test`, `tests`, `__snapshots__`);
 *   - a bare filename pattern matches the BASENAME at any depth (lockfiles, `*.test.*`);
 *   - first match wins, order: boilerplate -> tests -> wiring -> docs; no match -> core.
 */
import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/modules/smart-diff/domain.js';
import type { SmartDiffRole } from '@devdigest/shared';

const CASES: [path: string, role: SmartDiffRole, why: string][] = [
  // boilerplate
  ['__tests__/__snapshots__/x.snap', 'boilerplate', 'snapshot beats the __tests__ dir (boilerplate matches first)'],
  ['pnpm-lock.yaml', 'boilerplate', 'lockfile'],
  ['client/package-lock.json', 'boilerplate', 'lockfile, any depth'],
  ['yarn.lock', 'boilerplate', 'lockfile'],
  ['Cargo.lock', 'boilerplate', 'lockfile'],
  ['dist/a.js', 'boilerplate', 'root dist/**'],
  ['build/x.js', 'boilerplate', 'root build/**'],
  ['src/types/a.generated.ts', 'boilerplate', '*.generated.*'],
  ['public/vendor.min.js', 'boilerplate', '*.min.js'],
  // tests
  ['client/src/a.test.tsx', 'tests', '*.test.*'],
  ['server/test/a.it.test.ts', 'tests', '*.it.test.ts'],
  ['src/a.spec.ts', 'tests', '*.spec.*'],
  ['server/test/helpers/pg.ts', 'tests', 'test/** at any depth'],
  ['tests/x.ts', 'tests', 'tests/**'],
  ['src/__tests__/a.ts', 'tests', '__tests__/**'],
  ['e2e/README.md', 'tests', 'e2e/** is tests even for a markdown file (tests match before docs)'],
  // wiring
  ['src/index.ts', 'wiring', 'index barrel'],
  ['lib/index.js', 'wiring', 'index barrel'],
  ['vitest.config.ts', 'wiring', '*.config.*'],
  ['tsconfig.build.json', 'wiring', 'tsconfig*.json'],
  ['.eslintrc.cjs', 'wiring', '.eslintrc*'],
  ['.env.example', 'wiring', '.env*'],
  ['docker-compose.dev.yml', 'wiring', 'docker-compose*.yml'],
  ['.github/workflows/ci.yml', 'wiring', 'root .github/**'],
  ['.claude/skills/security/SKILL.md', 'wiring', '.claude/** is wiring even for markdown (wiring matches before docs)'],
  // docs
  ['docs/x.md', 'docs', 'root docs/**'],
  ['README', 'docs', 'README'],
  ['CHANGELOG.md', 'docs', 'CHANGELOG'],
  ['LICENSE', 'docs', 'LICENSE'],
  ['notes/design.md', 'docs', '*.md anywhere'],
  // core fallbacks
  ['src/config.ts', 'core', 'config.ts is not *.config.*'],
  ['src/server.ts', 'core', 'fallback'],
  ['src/build/util.ts', 'core', 'build/** is root-anchored'],
];

describe('classifyFile', () => {
  it.each(CASES)('%s -> %s (%s)', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});
