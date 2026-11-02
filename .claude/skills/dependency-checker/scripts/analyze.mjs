#!/usr/bin/env node
// dependencies-checker: collect facts. No dependencies — Node 20 built-ins only.
// Usage: node analyze.mjs [--out <dir>] [--top <n>]
// Writes report.json + report.md (diagrams, sizes, findings) and prints the md path.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { basename as basenameOf, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
// --root lets a runner point the script at a staged copy outside git.
const ROOT =
  arg('--root', null) ??
  execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: dirname(fileURLToPath(import.meta.url)),
    encoding: 'utf8',
  }).trim();
const OUT = arg('--out', join(ROOT, '.devdigest', 'cache', 'deps-check'));
const TOP = Number(arg('--top', 8));

const HEAVY_MB = 20; // transitive size that earns a "heavy" finding
const DEV_TOOLS = new Set(['dependency-cruiser', 'typescript', 'vitest', 'tsx', 'drizzle-kit', 'eslint', 'prettier', 'testcontainers']);
const SRC_DIRS = ['src', 'lib', 'test', 'tests', 'scripts', 'e2e', 'specs'];
const SRC_FILES = ['run.ts', 'next.config.mjs', 'postcss.config.mjs', 'vitest.config.ts', 'drizzle.config.ts', 'tsconfig.json'];
const TOOLING = new Set(['typescript', 'jsdom', 'postcss', 'tailwindcss', 'tsx', 'vitest']); // loaded by a tool, never imported
// A bare specifier that is a plausible package name (drops stray quoted strings).
const strRefsLooksLikePkg = (n) => !/^\d|^[A-Z]/.test(n) && n.length > 1;
const TEST_RE = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$|vitest\.config/;

const BUILTINS = new Set(builtinModules.map((m) => m.split('/')[0]));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const mb = (b) => b / 1024 / 1024;
const fmt = (b) => (b >= 1024 ** 2 ? `${mb(b).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

// ── packages ────────────────────────────────────────────────────────────────
const packages = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
  .filter((d) => existsSync(join(ROOT, d.name, 'package.json')))
  .map((d) => d.name)
  .sort();

// ── sizes ───────────────────────────────────────────────────────────────────
const sizeCache = new Map();
/** Bytes of one package dir, skipping nested node_modules (those are counted as deps). */
function dirSize(dir) {
  if (sizeCache.has(dir)) return sizeCache.get(dir);
  let total = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(p);
      } else if (e.isFile()) total += lstatSync(p).size;
    }
  };
  try {
    walk(dir);
  } catch {
    /* unreadable → 0 */
  }
  sizeCache.set(dir, total);
  return total;
}

/** Node resolution: nearest node_modules/<name> walking up from `from`. */
function resolveDep(name, from) {
  let dir = from;
  for (;;) {
    const cand = join(dir, 'node_modules', name);
    if (existsSync(join(cand, 'package.json'))) return realpathSync(cand);
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Transitive closure of runtime deps. Returns { dirs:Set, versions:Map(name→Set) }. */
function closure(name, pkgDir) {
  const start = resolveDep(name, pkgDir);
  if (!start) return null;
  const dirs = new Set();
  const stack = [start];
  while (stack.length) {
    const d = stack.pop();
    if (dirs.has(d)) continue;
    dirs.add(d);
    let pj;
    try {
      pj = readJson(join(d, 'package.json'));
    } catch {
      continue;
    }
    for (const dep of Object.keys({ ...pj.dependencies, ...pj.optionalDependencies })) {
      const r = resolveDep(dep, d);
      if (r) stack.push(r);
    }
  }
  return { start, dirs };
}

// ── usage scan ──────────────────────────────────────────────────────────────
function listSource(pkgDir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.next', 'clones'].includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.([cm]?[jt]sx?|css)$/.test(e.name)) out.push(p);
    }
  };
  for (const s of SRC_DIRS) if (existsSync(join(pkgDir, s))) walk(join(pkgDir, s));
  for (const f of SRC_FILES) if (existsSync(join(pkgDir, f))) out.push(join(pkgDir, f));
  return out;
}
const REL_RE = /(?:from|import|require)\s*\(?\s*['"](\.{1,2}\/[^'"]*)['"]/g;
const SPEC_RE = /(?:from|import|require)\s*\(?\s*['"]([^'".][^'"]*)['"]/g;
const specToName = (s) => (s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0]);

function scanUsage(pkgDir, strRefs, crossings) {
  const used = new Map(); // name → { files:Set, testOnly:boolean }
  for (const f of listSource(pkgDir)) {
    const text = readFileSync(f, 'utf8');
    const rel = relative(pkgDir, f);
    for (const m of text.matchAll(/['"]((?:@[\w.-]+\/)?[\w.-]+)['"]/g)) strRefs.add(m[1]);
    for (const m of text.matchAll(/@(?:import|plugin)\s+['"]([^'"]+)['"]/g)) strRefs.add(specToName(m[1]));
    for (const m of text.matchAll(REL_RE)) {
      const target = packages.find((p) => p !== basenameOf(pkgDir) && resolve(dirname(f), m[1]).startsWith(join(ROOT, p) + '/'));
      if (target) crossings.push({ file: rel, line: text.slice(0, m.index).split('\n').length, spec: m[1], to: target });
    }
    for (const m of text.matchAll(SPEC_RE)) {
      const n = specToName(m[1]);
      if (packages.includes(n) && n !== basenameOf(pkgDir) && m[1].includes('/'))
        crossings.push({ file: rel, line: text.slice(0, m.index).split('\n').length, spec: m[1], to: n });
      if (n.startsWith('node:')) continue;
      const u = used.get(n) ?? { files: 0, nonTest: 0 };
      u.files++;
      if (!TEST_RE.test(rel)) u.nonTest++;
      used.set(n, u);
    }
  }
  return used;
}

// ── analyse ─────────────────────────────────────────────────────────────────
const report = { generated: new Date().toISOString(), root: ROOT, packages: {}, findings: [], edges: [] };
const rangesByDep = new Map(); // dep → Map(range → [pkg])

for (const pkg of packages) {
  const dir = join(ROOT, pkg);
  const pj = readJson(join(dir, 'package.json'));
  const installed = existsSync(join(dir, 'node_modules'));
  const strRefs = new Set();
  const crossings = [];
  const usage = scanUsage(dir, strRefs, crossings);
  const peerOf = new Set();
  for (const name of Object.keys({ ...pj.dependencies, ...pj.devDependencies })) {
    const r = resolveDep(name, dir);
    if (r) for (const peer of Object.keys(readJson(join(r, 'package.json')).peerDependencies ?? {})) peerOf.add(peer);
  }
  const scriptsText = JSON.stringify(pj.scripts ?? {});
  const lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'].filter((l) => existsSync(join(dir, l)));
  const tsRaw = existsSync(join(dir, 'tsconfig.json')) ? readFileSync(join(dir, 'tsconfig.json'), 'utf8') : '';
  const aliasBlock = tsRaw.match(/"paths"\s*:\s*\{([^}]*)\}/)?.[1] ?? '';
  const aliases = [...aliasBlock.matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1].replace(/\*$/, ''));
  const providers = new Map(); // dep → declared dep whose closure contains it
  const entry = { name: pj.name, installed, lockfiles, deps: [], totalBytes: 0, packageManager: pj.packageManager ?? null };
  const allUnique = new Set();
  const versions = new Map();

  for (const [kind, block] of [['prod', pj.dependencies], ['dev', pj.devDependencies]]) {
    for (const [name, range] of Object.entries(block ?? {})) {
      const r = rangesByDep.get(name) ?? new Map();
      r.set(range, [...(r.get(range) ?? []), `${pkg}(${kind})`]);
      rangesByDep.set(name, r);

      const c = installed ? closure(name, dir) : null;
      let own = 0, trans = 0, version = null, count = 0;
      if (c) {
        own = dirSize(c.start);
        for (const d of c.dirs) {
          trans += dirSize(d);
          allUnique.add(d);
          try {
            const p = readJson(join(d, 'package.json'));
            versions.set(p.name, (versions.get(p.name) ?? new Set()).add(p.version));
          } catch {}
        }
        count = c.dirs.size;
        for (const d of c.dirs) {
          try {
            const n = readJson(join(d, 'package.json')).name;
            if (n !== name && !providers.has(n)) providers.set(n, name);
          } catch {}
        }
        version = readJson(join(c.start, 'package.json')).version;
      }
      const u = usage.get(name);
      const typesFor = name.startsWith('@types/');
      const usedViaBin = new RegExp(`\\b${name.replace(/^@[^/]+\//, '')}\\b`).test(scriptsText);
      entry.deps.push({
        name, kind, range, version, ownBytes: own, transBytes: trans, transCount: count,
        imports: u?.files ?? 0, nonTestImports: u?.nonTest ?? 0,
        usage: typesFor ? 'types' : u ? 'imported' : usedViaBin ? 'cli' : strRefs.has(name) ? 'string-ref' : TOOLING.has(name) ? 'tooling' : peerOf.has(name) ? 'peer' : 'none-found',
      });
    }
  }
  entry.totalBytes = [...allUnique].reduce((s, d) => s + dirSize(d), 0);
  entry.uniquePackages = allUnique.size;
  entry.duplicates = [...versions].filter(([, v]) => v.size > 1).map(([n, v]) => ({ name: n, versions: [...v] }));
  report.packages[pkg] = entry;

  // edges between our packages (alias or import of @devdigest/*)
  for (const [n] of usage) {
    const target = packages.find((p) => readJson(join(ROOT, p, 'package.json')).name === n);
    if (target && target !== pkg) report.edges.push({ from: pkg, to: target, via: 'import' });
  }
  const ts = existsSync(join(dir, 'tsconfig.json')) ? readFileSync(join(dir, 'tsconfig.json'), 'utf8') : '';
  for (const p of packages) {
    const n = readJson(join(ROOT, p, 'package.json')).name;
    if (p !== pkg && ts.includes(n) && !report.edges.some((e) => e.from === pkg && e.to === p))
      report.edges.push({ from: pkg, to: p, via: 'tsconfig alias (raw source)' });
  }

  for (const c of crossings) {
    if (TEST_RE.test(c.file)) continue;
    if (!report.edges.some((e) => e.from === pkg && e.to === c.to && e.via.startsWith('relative')))
      report.edges.push({ from: pkg, to: c.to, via: 'relative import (bypasses public entry)' });
  }
  // ── findings ──
  const F = (priority, rule, dep, msg, fix) =>
    report.findings.push({ priority, rule, package: pkg, dep, message: msg, fix });
  for (const c of crossings.filter((c) => !TEST_RE.test(c.file)).slice(0, 10))
    F('P0', 'internal-boundary-crossing', null, `${c.file}:${c.line} imports \`${c.spec}\` from package \`${c.to}\` by path, not through its public entry or a tsconfig alias.`, `Import through the package's public entry or an alias; packages here are copied, never reached into.`);
  if (!installed) F('P2', 'not-installed', null, 'node_modules missing — sizes unknown.', `Run the install command for ${pkg}.`);
  if (lockfiles.length > 1) F('P2', 'multiple-lockfiles', null, `Lockfiles: ${lockfiles.join(', ')}.`, 'Keep the authoritative one; see AGENTS.md "Do not touch".');
  const declared = new Set([...Object.keys({ ...pj.dependencies, ...pj.devDependencies, ...pj.peerDependencies, ...pj.optionalDependencies }), pj.name]);
  for (const [n, u] of usage) {
    const isAlias = aliases.some((a) => n.startsWith(a) || `${n}/` === a);
    if (!u.nonTest || declared.has(n) || BUILTINS.has(n) || isAlias || n.startsWith('node:') || n.startsWith('~') || n.startsWith('#')) continue;
    if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(n) || !strRefsLooksLikePkg(n)) continue;
    F('P0', 'undeclared-dependency', n, `Imported in ${u.nonTest} non-test file(s) but not declared in package.json${installed && resolveDep(n, dir) ? ' (resolves only through another package)' : ''}.`, `Add \`${n}\` to dependencies.`);
  }
  const pm = (pj.packageManager ?? '').split('@')[0];
  const foreign = { pnpm: 'package-lock.json', npm: 'pnpm-lock.yaml' }[pm];
  if (foreign && lockfiles.includes(foreign))
    F('P2', 'package-manager-mismatch', null, `packageManager is ${pj.packageManager.split('+')[0]} but ${foreign} is also present.`, 'Decide one package manager for this package; see AGENTS.md before touching lockfiles.');
  if (pm && !lockfiles.some((l) => l === { pnpm: 'pnpm-lock.yaml', npm: 'package-lock.json', yarn: 'yarn.lock' }[pm]) && lockfiles.length)
    F('P2', 'package-manager-mismatch', null, `packageManager is ${pj.packageManager.split('+')[0]} but its lockfile is missing (found ${lockfiles.join(', ')}).`, 'Align packageManager and the lockfile.');
  const wsFile = join(dir, 'pnpm-workspace.yaml');
  if (existsSync(wsFile) && /set this to true or false|TODO|FIXME/i.test(readFileSync(wsFile, 'utf8')))
    F('P2', 'placeholder-config', null, 'pnpm-workspace.yaml contains an unresolved placeholder value.', 'Set the value or delete the file.');
  const wfDir = join(ROOT, '.github', 'workflows');
  if (existsSync(wfDir)) {
    const wf = readdirSync(wfDir).map((f) => readFileSync(join(wfDir, f), 'utf8')).join('\n');
    if (!wf.includes(`${pkg}/`) && !wf.includes(`working-directory: ${pkg}`))
      F('Info', 'no-ci', null, `No workflow in .github/workflows mentions \`${pkg}\`; its dependencies are never installed in CI.`, 'Add a typecheck + test workflow.');
  }
  for (const d of entry.deps) {
    if (d.kind === 'prod' && (DEV_TOOLS.has(d.name) || (d.usage === 'imported' && d.nonTestImports === 0)))
      F('P1', 'prod-should-be-dev', d.name, `In dependencies, but ${DEV_TOOLS.has(d.name) ? 'it is a dev tool' : 'only tests import it'}.`, `Move to devDependencies.`);
    if (d.usage === 'none-found') {
      const by = providers.get(d.name);
      F('P1', 'possibly-unused', d.name, `No import or CLI use found in src/lib/test/scripts/configs.${by ? ` Also installed as a dependency of \`${by}\`.` : ''}`, by ? 'Verify, then remove; removal is safe for the install if the other dependency still needs it.' : 'Verify (dynamic load, config string, peer), then remove.');
    }
    if (d.kind === 'prod' && mb(d.transBytes) >= HEAVY_MB)
      F('P2', 'heavy', d.name, `${fmt(d.transBytes)} on disk (${d.transCount} packages).`, 'Check for a lighter alternative, lazy loading or a narrower sub-package.');
  }
  if (entry.duplicates.length)
    F('Info', 'duplicate-versions', null, `${entry.duplicates.length} packages resolve in 2+ versions; most-duplicated: ${entry.duplicates.slice(0, 5).map((d) => `${d.name} (${d.versions.join(', ')})`).join('; ')}.`, 'Mostly transitive. Align ranges or add an override only where it costs size.');
}

for (const [dep, ranges] of rangesByDep)
  if (ranges.size > 1) {
    const detail = [...ranges].map(([r, who]) => `${r} [${who.join(', ')}]`).join(' vs ');
    report.findings.push({ priority: 'P2', rule: 'version-drift', package: '*', dep, message: `Different ranges across packages: ${detail}.`, fix: 'Align the range in every package (no workspace — edit each package.json).' });
  }
const ORDER = { P0: 0, P1: 1, P2: 2, Info: 3 };
report.findings.sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || a.rule.localeCompare(b.rule));

// ── render ──────────────────────────────────────────────────────────────────
const id = (s) => s.replace(/[^a-zA-Z0-9]/g, '_');
const bar = (v, max) => '█'.repeat(Math.max(1, Math.round((v / max) * 20)));
const md = [];
md.push(`# Dependencies report`, '', `Generated ${report.generated}. Sizes = bytes on disk in \`node_modules\` (not gzip, not bundle size).`, '');

md.push('## 1. Scope', '', 'Packages analysed (a folder with its own package.json at the repo root). Sizes need `node_modules`; a package marked `not installed` has none.', '', '| package | deps (prod/dev) | unique installed pkgs | disk size | lockfile |', '|---|---|---|---|---|');
for (const [p, e] of Object.entries(report.packages)) {
  const prod = e.deps.filter((d) => d.kind === 'prod').length;
  md.push(`| \`${p}\` | ${prod}/${e.deps.length - prod} | ${e.installed ? e.uniquePackages : '—'} | ${e.installed ? fmt(e.totalBytes) : 'not installed'} | ${e.lockfiles.join(', ') || '—'} |`);
}

md.push('', '## 2. Dependency graph', '', '```mermaid', 'flowchart LR');
for (const p of Object.keys(report.packages)) md.push(`  ${id(p)}["${p}<br/>${report.packages[p].installed ? fmt(report.packages[p].totalBytes) : 'n/a'}"]`);
for (const e of report.edges) md.push(`  ${id(e.from)} -->|"${e.via}"| ${id(e.to)}`);
const shared = [...rangesByDep].filter(([, r]) => new Set([...r.values()].flat().map((x) => x.split('(')[0])).size > 1);
for (const [dep, r] of shared) {
  md.push(`  ${id('x_' + dep)}(("${dep}"))`);
  for (const who of new Set([...r.values()].flat().map((x) => x.split('(')[0]))) md.push(`  ${id(who)} -.-> ${id('x_' + dep)}`);
}
md.push('```', '', '_Solid = internal link. Dotted circles = external dependency shared by 2+ packages._');

md.push('', '## 3. Size breakdown', '', '```mermaid', 'pie showData title Installed size (MB)');
for (const [p, e] of Object.entries(report.packages)) if (e.installed) md.push(`  "${p}" : ${mb(e.totalBytes).toFixed(1)}`);
md.push('```');

md.push('', `### Heaviest dependencies (top ${TOP} per package)`, '');
for (const [p, e] of Object.entries(report.packages)) {
  if (!e.installed) continue;
  const top = [...e.deps].sort((a, b) => b.transBytes - a.transBytes).slice(0, TOP);
  const max = top[0]?.transBytes || 1;
  md.push(`### \`${p}\``, '', '| dep | kind | version | own | with transitive | pkgs | usage | |', '|---|---|---|---|---|---|---|---|');
  for (const d of top) md.push(`| \`${d.name}\` | ${d.kind} | ${d.version} | ${fmt(d.ownBytes)} | ${fmt(d.transBytes)} | ${d.transCount} | ${d.usage} | ${bar(d.transBytes, max)} |`);
  md.push('');
}
md.push('_"with transitive" overlaps between deps (shared sub-deps are counted in each row), so rows do not sum to the package total._');

md.push('', '## 4. Findings & Priorities', '');
const labels = { P0: 'P0 — fix now (breaks or hides breakage)', P1: 'P1 — fix soon (wrong or dead)', P2: 'P2 — plan (cost or drift)', Info: 'Info — low impact' };
for (const pr of ['P0', 'P1', 'P2', 'Info']) {
  const fs = report.findings.filter((f) => f.priority === pr);
  if (!fs.length) continue;
  md.push(`### ${labels[pr]}`, '', '| rule | package | dep | what | fix |', '|---|---|---|---|---|');
  for (const f of fs) md.push(`| ${f.rule} | ${f.package} | ${f.dep ? '`' + f.dep + '`' : '—'} | ${f.message} | ${f.fix} |`);
  md.push('');
}
if (!report.findings.length) md.push('No findings.');

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'report.md'), md.join('\n') + '\n');
console.log(join(OUT, 'report.md'));
