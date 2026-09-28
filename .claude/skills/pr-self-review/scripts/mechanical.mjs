#!/usr/bin/env node
// Deterministic checks that run before any model review. Their severity is fixed
// here, never re-judged. Output: {findings: [...], errors: [...]} on stdout.
//   errors = a gate that could not run (missing install) — blocks as INCOMPLETE.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addedLines, collect, git, repoRoot } from './lib.mjs';

const PACKAGES = {
  server: ['tsc', '--noEmit', '-p', 'tsconfig.json'],
  client: ['tsc', '--noEmit'],
  'reviewer-core': ['tsc', '--noEmit', '-p', 'tsconfig.json'],
  e2e: ['tsc', '--noEmit', '-p', 'tsconfig.json'],
};
const MIGRATIONS = 'server/src/db/migrations/';

const finding = (severity, rule, file, summary, fix, extra = {}) => ({
  severity,
  source: 'mechanical',
  rule,
  file,
  line: null,
  summary,
  fix,
  ...extra,
});

const tail = (text, n = 25) => text.trim().split('\n').slice(-n).join('\n');

/** Pure checks over the change set — unit-testable without running tools. */
export function repoRuleFindings(files, added, existedAtBase) {
  const out = [];
  const paths = files.map((f) => f.path);
  const statusOf = new Map(files.map((f) => [f.path, f.status]));
  const isNew = (s) => s === 'A' || s === 'U';

  // Migrations: never edit/delete an applied one; a new .sql comes with its meta.
  for (const { path, status } of files.filter((f) => f.path.startsWith(MIGRATIONS))) {
    // drizzle-kit appends to _journal.json on every generate — only deleting it is wrong.
    const journalAppend = path.endsWith('meta/_journal.json') && status === 'M';
    if (!isNew(status) && !journalAppend && existedAtBase(path)) {
      out.push(finding('CRITICAL', 'migration-edited', path,
        `Existing migration file was ${status === 'D' ? 'deleted' : 'modified'} — applied migrations are immutable (AGENTS.md "Do not touch").`,
        'Revert this file and add a new migration with drizzle-kit generate.'));
    }
    const m = path.match(/^server\/src\/db\/migrations\/(\d{4})_[^/]+\.sql$/);
    if (m && isNew(status)) {
      const snap = `${MIGRATIONS}meta/${m[1]}_snapshot.json`;
      if (!isNew(statusOf.get(snap)) || !statusOf.has(`${MIGRATIONS}meta/_journal.json`)) {
        out.push(finding('CRITICAL', 'migration-hand-written', path,
          'New migration .sql without its drizzle-kit meta (snapshot + _journal.json entry) — looks hand-written.',
          'Delete it and run ./node_modules/.bin/drizzle-kit generate in server/.'));
      }
    }
  }

  // A DB-touching test outside the *.it.test.ts lane breaks the hermetic CI job.
  for (const { path, status } of files) {
    if (status === 'D' || !/^server\/test\/.*\.test\.ts$/.test(path) || path.endsWith('.it.test.ts')) continue;
    let src = '';
    try {
      src = readFileSync(join(repoRoot(), path), 'utf8');
    } catch {}
    if (/from\s+['"][./]*helpers\/pg(\.js|\.ts)?['"]/.test(src)) {
      out.push(finding('CRITICAL', 'db-test-naming', path,
        'Test imports test/helpers/pg.ts but is not named *.it.test.ts — it lands in the hermetic lane and fails CI.',
        'Rename it to *.it.test.ts.'));
    }
  }

  // Vendored contracts: edit both copies or neither.
  const touched = (dir) => paths.some((p) => p.startsWith(dir));
  const sv = touched('server/src/vendor/shared/');
  const cv = touched('client/src/vendor/shared/');
  if (sv !== cv) {
    out.push(finding('HIGH', 'vendor-shared-drift', sv ? 'server/src/vendor/shared' : 'client/src/vendor/shared',
      'Only one copy of @devdigest/shared changed — the server and client contracts drift.',
      'Apply the same change to the other copy (or revert).'));
  }

  for (const lock of ['server/package-lock.json', 'client/package-lock.json']) {
    if (statusOf.has(lock)) {
      out.push(finding('HIGH', 'stray-npm-lockfile', lock,
        'package-lock.json changed in a pnpm package — pnpm-lock.yaml is authoritative, this file is a leftover.',
        'Revert it; install with pnpm (or ./node_modules/.bin) only.'));
    }
  }

  // Client: @devdigest/shared is type-only; a runtime import breaks the webpack build.
  for (const [path, lines] of Object.entries(added)) {
    if (!path.startsWith('client/src/') || path.startsWith('client/src/vendor/')) continue;
    for (const line of lines) {
      const m = line.match(/^\s*import\s+(?!type\b)(.*?)\s+from\s+['"]@devdigest\/shared['"]/);
      if (!m) continue;
      const specs = m[1].replace(/^\{|\}$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
      if (specs.every((s) => s.startsWith('type '))) continue;
      out.push(finding('HIGH', 'shared-runtime-import', path,
        `Runtime import from @devdigest/shared in the client: \`${line.trim()}\`.`,
        'Use `import type`, or copy the runtime value into client code.'));
    }
  }
  return out;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}`, error: r.error };
}

function toolFindings(files) {
  const findings = [];
  const errors = [];
  const root = repoRoot();
  const live = files.filter((f) => f.status !== 'D');
  const changedPkgs = Object.keys(PACKAGES).filter((pkg) =>
    files.some(
      (f) =>
        f.path.startsWith(`${pkg}/`) &&
        !f.path.startsWith(`${pkg}/clones/`) &&
        /\.(ts|tsx|mts|cts|js|mjs|json)$/.test(f.path),
    ),
  );

  // Onion Architecture gate (dependency-cruiser + container.db grep).
  if (live.some((f) => f.path.startsWith('server/src/') && !f.path.startsWith('server/src/vendor/'))) {
    const r = run('bash', [join(root, '.claude/skills/onion-architecture/scripts/check.sh')], root);
    if (r.code === 2) errors.push({ gate: 'onion-architecture', message: tail(r.output) });
    else if (r.code !== 0) {
      findings.push(finding('CRITICAL', 'onion-dependency-rule', 'server/src',
        'onion-architecture check.sh found NEW dependency-rule violations.',
        'Fix the imports listed in `output`; rules: .claude/skills/onion-architecture/SKILL.md.',
        { output: tail(r.output, 40) }));
    }
  }

  // Typecheck every package with changes.
  for (const pkg of changedPkgs) {
    const dir = join(root, pkg);
    const [bin, ...args] = PACKAGES[pkg];
    const exe = join(dir, 'node_modules', '.bin', bin);
    if (!existsSync(exe)) {
      errors.push({ gate: `typecheck:${pkg}`, message: `${pkg}/node_modules/.bin/tsc missing — install ${pkg} deps first.` });
      continue;
    }
    if (pkg === 'server' && !existsSync(join(root, 'reviewer-core', 'node_modules'))) {
      errors.push({ gate: 'typecheck:server', message: 'reviewer-core deps missing — run `cd reviewer-core && npm ci` (server type-checks its raw source).' });
      continue;
    }
    const r = run(exe, args, dir);
    if (r.code !== 0) {
      findings.push(finding('CRITICAL', 'typecheck', pkg,
        `tsc --noEmit fails in ${pkg}.`, 'Fix the type errors in `output`.', { output: tail(r.output, 40) }));
    }
  }
  return { findings, errors };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const snapshot = collect();
  const added = addedLines(snapshot);
  const existedAtBase = (path) => {
    try {
      git(['cat-file', '-e', `${snapshot.base}:${path}`], { quiet: true });
      return true;
    } catch {
      return false;
    }
  };
  const rules = repoRuleFindings(snapshot.files, added, existedAtBase);
  const tools = process.argv.includes('--no-tools') ? { findings: [], errors: [] } : toolFindings(snapshot.files);
  const result = {
    diff_hash: snapshot.diff_hash,
    findings: [...rules, ...tools.findings],
    errors: tools.errors,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
