#!/usr/bin/env node
// Review bundle: everything a read-only reviewer needs about the local change, in one
// folder, so architecture-reviewer, security-reviewer and plan-verifier read one file
// instead of rebuilding the diff file by file. Same snapshot and routing as /pr-self-review.
//   node bundle.mjs write [--no-gates]   → writes .devdigest/cache/review-bundle/, prints summary.md
//   node bundle.mjs reuse --plan P.json  → for /pr-self-review: drops from P's skill routes the
//        files the SDD reviewers already reviewed unchanged, prints {plan, carried} as JSON
//
// Files written by `write`:
//   summary.md       base, changed files per package with +/- lines and routed skills, gate results
//   diff.patch       full diff against the base, untracked files included as new files
//   diff/<pkg>.patch the same, one file per top-level folder (`.claude` → `_claude.patch`)
//   plan.json        route.mjs output (snapshot + skill routing)
//   mechanical.json  mechanical.mjs output (onion gate, tsc per package, repo rules)
//   hashes.json      content hash per changed file at bundle time (for `reuse`)
// The orchestrator later saves the reviewers' "Findings JSON" blocks to reviews.json there.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SKILL_DIR, addedLines, collect, fileFingerprint, git, readJson, repoRoot } from './lib.mjs';
import { route } from './route.mjs';

export const BUNDLE_DIR = () => join(repoRoot(), '.devdigest', 'cache', 'review-bundle');

/** Which /pr-self-review skills each SDD reviewer agent already covers. */
export const COVERED_BY = {
  'architecture-reviewer': ['onion-architecture', 'frontend-ui-architecture'],
  'security-reviewer': ['security'],
};

const hashOf = (path) => createHash('sha256').update(fileFingerprint(join(repoRoot(), path))).digest('hex');

function untrackedPatch(files) {
  let out = '';
  for (const f of files.filter((x) => x.status === 'U')) {
    // --no-index exits 1 when files differ; that is the normal case here.
    const r = spawnSync('git', ['diff', '--no-color', '--no-index', '--', '/dev/null', f.path], {
      cwd: repoRoot(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    out += r.stdout;
  }
  return out;
}

function numstat(base) {
  const out = {};
  for (const line of git(['diff', '--no-renames', '--numstat', base]).split('\n').filter(Boolean)) {
    const [add, del, path] = line.split('\t');
    out[path] = `+${add} -${del}`;
  }
  return out;
}

export function summary(plan, mechanical, stats) {
  const skillsOf = (path) => Object.entries(plan.skills).filter(([, fs]) => fs.includes(path)).map(([s]) => s);
  const byPkg = {};
  for (const f of plan.files) (byPkg[f.path.split('/')[0]] ??= []).push(f);
  const lines = [
    '# Review bundle',
    '',
    `Base \`${plan.base_ref}\` @ ${plan.base.slice(0, 8)} · HEAD ${plan.head.slice(0, 8)}${plan.dirty ? ' + uncommitted changes' : ''} · diff_hash ${plan.diff_hash.slice(0, 12)}`,
    'Diff: `diff/<package>.patch` in this folder (`.claude` is `diff/_claude.patch`); `diff.patch` holds all of them. Read the patch of the package you review, not the whole tree.',
    'Status: A added, M modified, D deleted, U untracked (new).',
    '',
  ];
  for (const [pkg, files] of Object.entries(byPkg)) {
    lines.push(`## ${pkg}`);
    for (const f of files) {
      const s = f.status === 'U' ? 'new file' : stats[f.path] ?? '';
      const sk = skillsOf(f.path);
      lines.push(`- ${f.status} \`${f.path}\` ${s}${sk.length ? ` — ${sk.join(', ')}` : ''}`);
    }
    lines.push('');
  }
  lines.push('## Mechanical gates');
  if (!mechanical) lines.push('- not run (--no-gates)');
  else {
    if (!mechanical.findings.length && !mechanical.errors.length) lines.push('- all passed');
    for (const f of mechanical.findings) {
      lines.push(`- ${f.severity} ${f.rule} \`${f.file}\` — ${f.summary}`);
      if (f.output) lines.push('', '```', f.output, '```', '');
    }
    for (const e of mechanical.errors) lines.push(`- could not run: ${e.gate} — ${e.message}`);
  }
  return lines.join('\n') + '\n';
}

function write({ gates }) {
  const dir = BUNDLE_DIR();
  mkdirSync(dir, { recursive: true });
  rmSync(join(dir, 'reviews.json'), { force: true }); // reviews belong to the bundle they read
  const snapshot = collect();
  const plan = { ...snapshot, ...route(snapshot.files, addedLines(snapshot)) };
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');

  const patch = git(['diff', '--no-renames', '--no-color', snapshot.base]) + untrackedPatch(snapshot.files);
  writeFileSync(join(dir, 'diff.patch'), patch);
  // One patch per top-level folder, so a reviewer reads only the package it reviews.
  rmSync(join(dir, 'diff'), { recursive: true, force: true });
  mkdirSync(join(dir, 'diff'));
  const pkgs = [...new Set(snapshot.files.map((f) => f.path.split('/')[0]))];
  for (const pkg of pkgs) {
    const own = snapshot.files.filter((f) => f.path.split('/')[0] === pkg);
    const text = git(['diff', '--no-renames', '--no-color', snapshot.base, '--', pkg]) + untrackedPatch(own);
    writeFileSync(join(dir, 'diff', `${pkg.replace(/^\./, '_')}.patch`), text);
  }

  const hashes = Object.fromEntries(snapshot.files.map((f) => [f.path, hashOf(f.path)]));
  writeFileSync(join(dir, 'hashes.json'), JSON.stringify({ diff_hash: snapshot.diff_hash, files: hashes }, null, 2) + '\n');

  let mechanical = null;
  if (gates) {
    const r = spawnSync(process.execPath, [join(SKILL_DIR, 'scripts', 'mechanical.mjs')], {
      cwd: repoRoot(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    mechanical = JSON.parse(r.stdout || '{"findings":[],"errors":[{"gate":"mechanical","message":"no output"}]}');
    writeFileSync(join(dir, 'mechanical.json'), JSON.stringify(mechanical, null, 2) + '\n');
  }
  const text = summary(plan, mechanical, numstat(snapshot.base));
  writeFileSync(join(dir, 'summary.md'), text);
  process.stdout.write(`${text}\nBundle: ${dir} (summary.md, diff/<pkg>.patch, diff.patch ${patch.split('\n').length} lines, plan.json, mechanical.json, hashes.json)\n`);
}

/**
 * Pure: remove files the SDD reviewers already reviewed with the same content.
 * @param plan     route.mjs output now
 * @param hashes   {files: {path: hash}} saved at bundle time
 * @param reviews  [{agent, findings: [...]}] saved by the orchestrator from the reviewer reports
 * @param hashNow  path → current hash
 */
export function reuse(plan, hashes, reviews, hashNow) {
  const done = new Set(reviews.map((r) => r.agent));
  const unchanged = (path) => hashes.files?.[path] != null && hashes.files[path] === hashNow(path);
  const skills = {};
  const carried = [];
  const skipped = {};
  for (const [skill, files] of Object.entries(plan.skills)) {
    const agent = Object.keys(COVERED_BY).find((a) => done.has(a) && COVERED_BY[a].includes(skill));
    const keep = agent ? files.filter((p) => !unchanged(p)) : files;
    if (keep.length) skills[skill] = keep;
    if (agent && keep.length < files.length) skipped[skill] = files.filter((p) => !keep.includes(p));
  }
  for (const r of reviews) {
    for (const f of r.findings ?? []) {
      if (f.file && unchanged(f.file)) carried.push({ ...f, source: `agent:${r.agent}` });
    }
  }
  return { plan: { ...plan, skills }, carried: [{ skill: 'sdd-reviewers', findings: carried }], skipped };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === 'write') write({ gates: !process.argv.includes('--no-gates') });
  else if (cmd === 'reuse') {
    const dir = BUNDLE_DIR();
    const plan = readJson(arg('--plan'), null);
    if (!plan) throw new Error('bundle.mjs reuse: --plan <plan.json> is required');
    const reviewsPath = join(dir, 'reviews.json');
    if (!existsSync(reviewsPath)) {
      process.stdout.write(JSON.stringify({ plan, carried: [], skipped: {} }, null, 2) + '\n');
    } else {
      const out = reuse(plan, readJson(join(dir, 'hashes.json'), {}), readJson(reviewsPath, []), hashOf);
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    }
  } else {
    process.stderr.write('usage: bundle.mjs write [--no-gates] | reuse --plan <plan.json>\n');
    process.exit(64);
  }
}
