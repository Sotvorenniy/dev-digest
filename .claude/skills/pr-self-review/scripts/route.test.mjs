// node --test .claude/skills/pr-self-review/scripts/*.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { SKILL_DIR, globToRegExp } from './lib.mjs';
import { repoRuleFindings } from './mechanical.mjs';
import { loadRouting, route } from './route.mjs';
import { decide, normalise } from './verdict.mjs';

const files = (...paths) => paths.map((p) => (typeof p === 'string' ? { path: p, status: 'M' } : p));
const skillsFor = (path, added = {}) =>
  Object.entries(route(files(path), added).skills)
    .filter(([, fs]) => fs.includes(path))
    .map(([s]) => s)
    .sort();

test('globToRegExp', () => {
  assert.ok(globToRegExp('client/src/**/*.tsx').test('client/src/app/page.tsx'));
  assert.ok(globToRegExp('client/src/**/*.tsx').test('client/src/a/b/C.tsx'));
  assert.ok(!globToRegExp('client/src/*.tsx').test('client/src/a/C.tsx'));
  assert.ok(globToRegExp('**/*secret*').test('server/src/platform/secrets.ts'));
  assert.ok(globToRegExp('{server,client}/x.{ts,tsx}').test('client/x.tsx'));
  assert.ok(!globToRegExp('server/src/db/schema.ts').test('server/src/db/schemaXts'));
});

test('UI files get UI skills only', () => {
  assert.deepEqual(skillsFor('client/src/app/repos/page.tsx'), [
    'frontend-ui-architecture',
    'next-best-practices',
    'react-best-practices',
  ]);
  assert.deepEqual(skillsFor('client/src/components/finding-card/FindingCard.test.tsx'), [
    'frontend-ui-architecture',
    'react-best-practices',
    'react-testing-library',
  ]);
});

test('backend files get backend skills only', () => {
  assert.deepEqual(skillsFor('server/src/modules/agents/routes.ts'), [
    'fastify-best-practices',
    'onion-architecture',
    'security',
  ]);
  assert.deepEqual(skillsFor('server/src/modules/agents/repository.ts'), [
    'drizzle-orm-patterns',
    'onion-architecture',
  ]);
  assert.deepEqual(skillsFor('server/src/db/migrations/0011_new.sql'), ['postgresql-table-design']);
});

test('content triggers route by added lines', () => {
  const p = 'server/src/modules/agents/service.ts';
  assert.ok(!skillsFor(p).includes('zod'));
  assert.ok(skillsFor(p, { [p]: ["import { z } from 'zod';"] }).includes('zod'));
  assert.ok(skillsFor(p, { [p]: ['const t = process.env.GITHUB_TOKEN;'] }).includes('security'));
});

test('excluded, deleted and uncovered files', () => {
  const r = route(
    files(
      'server/src/vendor/shared/contracts.ts',
      'server/pnpm-lock.yaml',
      { path: 'client/src/app/gone.tsx', status: 'D' },
      'README.md',
    ),
    {},
  );
  assert.deepEqual(r.skills, {});
  assert.deepEqual(r.excluded.sort(), ['server/pnpm-lock.yaml', 'server/src/vendor/shared/contracts.ts']);
  assert.deepEqual(r.not_covered, ['README.md']);
});

test('every skill directory is routed or explicitly not a review skill', () => {
  const routing = loadRouting();
  const known = new Set([...routing.rules.map((r) => r.skill), ...routing.notReviewSkills]);
  const skillsRoot = join(SKILL_DIR, '..');
  const dirs = readdirSync(skillsRoot).filter((d) => statSync(join(skillsRoot, d)).isDirectory());
  const missing = dirs.filter((d) => !known.has(d));
  assert.deepEqual(missing, [], `add these to routing.json rules or notReviewSkills: ${missing.join(', ')}`);
  const ghost = [...known].filter((s) => !dirs.includes(s));
  assert.deepEqual(ghost, [], `routing.json names skills that do not exist: ${ghost.join(', ')}`);
});

test('repo rules: migrations', () => {
  const existed = (p) => p === 'server/src/db/migrations/0003_minor_overlord.sql';
  const edited = repoRuleFindings(files('server/src/db/migrations/0003_minor_overlord.sql'), {}, existed);
  assert.equal(edited[0].rule, 'migration-edited');
  assert.equal(edited[0].severity, 'CRITICAL');

  const hand = repoRuleFindings(files({ path: 'server/src/db/migrations/0011_x.sql', status: 'U' }), {}, () => false);
  assert.equal(hand[0].rule, 'migration-hand-written');

  const generated = repoRuleFindings(
    files(
      { path: 'server/src/db/migrations/0011_x.sql', status: 'A' },
      { path: 'server/src/db/migrations/meta/0011_snapshot.json', status: 'A' },
      'server/src/db/migrations/meta/_journal.json',
    ),
    {},
    (p) => p.endsWith('_journal.json'),
  );
  assert.deepEqual(generated, []);
});

test('repo rules: vendor drift, lockfile, runtime shared import', () => {
  const rules = (fs, added = {}) => repoRuleFindings(files(...fs), added, () => true).map((f) => f.rule);
  assert.deepEqual(rules(['server/src/vendor/shared/contracts.ts']), ['vendor-shared-drift']);
  assert.deepEqual(rules(['server/src/vendor/shared/a.ts', 'client/src/vendor/shared/a.ts']), []);
  assert.deepEqual(rules(['client/package-lock.json']), ['stray-npm-lockfile']);
  const p = 'client/src/lib/x.ts';
  assert.deepEqual(rules([p], { [p]: ["import { Verdict } from '@devdigest/shared';"] }), ['shared-runtime-import']);
  assert.deepEqual(rules([p], { [p]: ["import type { Verdict } from '@devdigest/shared';"] }), []);
  assert.deepEqual(rules([p], { [p]: ["import { type Verdict } from '@devdigest/shared';"] }), []);
});

test('verdict: one CRITICAL blocks, errors make it INCOMPLETE, duplicates merge', () => {
  const llm = [
    { skill: 'react-best-practices', findings: [{ severity: 'critical', file: 'a.tsx', line: 3, rule: 'keys' }] },
    { skill: 'frontend-ui-architecture', findings: [{ severity: 'HIGH', file: 'a.tsx', line: 3, rule: 'x' }] },
  ];
  const findings = normalise({ findings: [] }, llm);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'CRITICAL');
  assert.equal(findings[0].source, 'skill:react-best-practices, skill:frontend-ui-architecture');
  assert.equal(decide(findings, []).verdict, 'BLOCKED');
  assert.equal(decide([], [{ gate: 'typecheck:server', message: '' }]).verdict, 'INCOMPLETE');
  assert.equal(decide([{ severity: 'HIGH' }], []).verdict, 'PASS');
});
