// node --test .claude/skills/pr-self-review/scripts/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reuse, summary } from './bundle.mjs';

const plan = {
  base: 'b'.repeat(40), base_ref: 'origin/main', head: 'h'.repeat(40), dirty: true, diff_hash: 'd'.repeat(64),
  files: [{ path: 'server/src/modules/a/service.ts', status: 'M' }, { path: 'client/src/app/X.tsx', status: 'U' }],
  skills: {
    'onion-architecture': ['server/src/modules/a/service.ts'],
    security: ['server/src/modules/a/service.ts'],
    'frontend-ui-architecture': ['client/src/app/X.tsx'],
    'react-best-practices': ['client/src/app/X.tsx'],
  },
};
const hashes = { files: { 'server/src/modules/a/service.ts': 'h1', 'client/src/app/X.tsx': 'h2' } };

test('reuse: skills an SDD reviewer covered drop files whose content is unchanged', () => {
  const now = { 'server/src/modules/a/service.ts': 'h1', 'client/src/app/X.tsx': 'CHANGED' };
  const reviews = [{ agent: 'architecture-reviewer', findings: [
    { severity: 'HIGH', file: 'server/src/modules/a/service.ts', line: 3, rule: 'r', summary: 's' },
    { severity: 'LOW', file: 'client/src/app/X.tsx', line: 1, rule: 'r', summary: 'stale' },
  ] }];
  const out = reuse(plan, hashes, reviews, (p) => now[p]);
  assert.deepEqual(Object.keys(out.plan.skills).sort(), ['frontend-ui-architecture', 'react-best-practices', 'security']);
  assert.deepEqual(out.plan.skills['frontend-ui-architecture'], ['client/src/app/X.tsx'], 'changed file is reviewed again');
  assert.deepEqual(out.skipped, { 'onion-architecture': ['server/src/modules/a/service.ts'] });
  assert.equal(out.carried[0].findings.length, 1, 'findings on changed files are not carried');
  assert.equal(out.carried[0].findings[0].source, 'agent:architecture-reviewer');
});

test('reuse: without reviewer reports nothing is skipped', () => {
  const out = reuse(plan, hashes, [], () => 'h1');
  assert.deepEqual(out.plan.skills, plan.skills);
  assert.deepEqual(out.carried[0].findings, []);
});

test('summary lists files per package with their skills and the gate results', () => {
  const text = summary(plan, { findings: [], errors: [] }, { 'server/src/modules/a/service.ts': '+3 -1' });
  assert.match(text, /## server\n- M `server\/src\/modules\/a\/service.ts` \+3 -1 — onion-architecture, security/);
  assert.match(text, /- U `client\/src\/app\/X.tsx` new file — frontend-ui-architecture, react-best-practices/);
  assert.match(text, /## Mechanical gates\n- all passed/);
});
