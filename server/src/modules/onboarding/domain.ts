import type {
  OnboardingReadingPathEntry,
  OnboardingSections,
  OnboardingSkeletonReason,
} from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import type { RootFilesSnapshot } from '../../ports/root-files.js';
import type { IndexStatus, RankedFileRow } from '../repo-intel/types.js';
import {
  ARCH_NODES_MAX,
  CANDIDATE_COMMANDS_MAX,
  CRITICAL_PATHS_MAX,
  FACT_FILES_MAX,
  FIRST_TASKS_MAX,
  READING_PATH_MAX,
  README_COMMAND_MAX_CHARS,
  README_COMMANDS_MAX,
  README_EXCERPT_MAX_CHARS,
  STACK_DEPS_MAX,
} from './constants.js';

/**
 * Onboarding domain rules — pure functions, no I/O, no runtime zod. Everything
 * read from the repo (README, scripts, paths) and everything the model returns
 * is UNTRUSTED: commands are only ever taken from derived candidates and paths
 * only from the indexed file set.
 */

export class RepoNotIndexedError extends AppError {
  constructor(message = 'Repository is not indexed yet') {
    super('repo_not_indexed', message, 409);
  }
}

export type SkeletonIndexReason = Extract<OnboardingSkeletonReason, 'index_degraded' | 'index_failed'>;

export interface Candidate {
  command: string;
  source: string;
}

export interface ScoredPath {
  path: string;
  score: number;
}

export interface StackFacts {
  dependencies: string[];
  extensions: { ext: string; count: number }[];
}

export interface StructureDir {
  dir: string;
  files: number;
}

// ---- gating ----------------------------------------------------------------------

/** A tour can be requested only for a repo with a clone and a persisted index row. */
export function isUsable(clonePath: string | null, hasIndexState: boolean): boolean {
  return !!clonePath && hasIndexState;
}

/**
 * Index states that must not reach the LLM. An empty ranked set is treated as
 * degraded: with no grounded file set every model path would be dropped.
 */
export function skeletonReasonForIndex(
  status: IndexStatus,
  filesIndexed: number,
  rankedCount: number,
): SkeletonIndexReason | null {
  if (status === 'failed') return 'index_failed';
  if (status === 'degraded' || filesIndexed === 0 || rankedCount === 0) return 'index_degraded';
  return null;
}

// ---- scoring ---------------------------------------------------------------------

export function scoreOf(pagerank: number, hotness: number): number {
  return pagerank * (1 + hotness);
}

function rankOrdered(rows: RankedFileRow[]): ScoredPath[] {
  return rows
    .filter((r) => !r.junk)
    .map((r) => ({ path: r.path, score: scoreOf(r.pagerank, r.hotness) }))
    .sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function selectReadingPath(rows: RankedFileRow[]): ScoredPath[] {
  return rankOrdered(rows).slice(0, READING_PATH_MAX);
}

export function selectFactFiles(rows: RankedFileRow[]): ScoredPath[] {
  return rankOrdered(rows).slice(0, FACT_FILES_MAX);
}

export function churnAvailable(rows: RankedFileRow[]): boolean {
  return rows.some((r) => r.hotness > 0);
}

// ---- candidate commands ----------------------------------------------------------

export function inferPackageManager(lockfiles: string[]): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  if (lockfiles.includes('pnpm-lock.yaml')) return 'pnpm';
  if (lockfiles.includes('yarn.lock')) return 'yarn';
  if (lockfiles.includes('bun.lockb') || lockfiles.includes('bun.lock')) return 'bun';
  return 'npm';
}

/** Names that are safe to place in a shell command line. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/;
/**
 * README lines are repo-authored and end up one click from the clipboard. Drop any
 * line that chains, pipes, redirects or substitutes commands, expands a variable,
 * or hides text with a control or format character (a lone `\r` or a bidi override
 * can mask part of a pasted line in a terminal).
 */
const README_UNSAFE = /[\u0000-\u001f\u007f`;|&<>]|\$[({A-Za-z_]|\p{Cf}/u;

interface PackageJsonFacts {
  scripts: string[];
  dependencies: string[];
}

function parsePackageJson(text: string | null): PackageJsonFacts | null {
  if (text === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;
  const keysOf = (v: unknown): string[] =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as object) : [];
  return {
    scripts: keysOf(obj.scripts),
    dependencies: [...keysOf(obj.dependencies), ...keysOf(obj.devDependencies)],
  };
}

/** Top-level service names of a compose file, parsed line-based (no YAML dependency). */
function composeServices(text: string): string[] {
  const out: string[] = [];
  let inServices = false;
  let indent = -1;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(raw)) continue;
    const lead = raw.length - raw.trimStart().length;
    if (lead === 0) {
      inServices = /^services:\s*(#.*)?$/.test(raw);
      indent = -1;
      continue;
    }
    if (!inServices) continue;
    if (indent === -1) indent = lead;
    if (lead !== indent) continue;
    const m = /^\s+["']?([A-Za-z0-9][A-Za-z0-9_.-]*)["']?:\s*(#.*)?$/.exec(raw);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

function makeTargets(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_.-]+):(?!=)/.exec(line);
    const name = m?.[1];
    if (!name || name === '.PHONY' || name.includes('%')) continue;
    if (!SAFE_NAME.test(name)) continue;
    out.push(name);
  }
  return out;
}

const README_HEADING = /install|getting started|quick ?start|run|setup|development|usage/i;
const SHELL_LANGS = new Set(['', 'sh', 'bash', 'shell', 'zsh', 'console', 'shell-session', 'terminal']);

/** Text of the first README section whose heading matches the install/run pattern. */
function readmeSection(text: string): string | null {
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let start = -1;
  let level = 0;
  let end = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!h) continue;
    const hl = h[1]?.length ?? 0;
    if (start === -1) {
      if (README_HEADING.test(h[2] ?? '')) {
        start = i;
        level = hl;
      }
    } else if (hl <= level) {
      end = i;
      break;
    }
  }
  if (start === -1) return null;
  return lines.slice(start, end).join('\n');
}

function readmeShellLines(section: string): string[] {
  const out: string[] = [];
  let inFence = false;
  let shell = false;
  for (const raw of section.split(/\r?\n/)) {
    const fence = /^\s*(?:```|~~~)\s*([\w-]*)/.exec(raw);
    if (fence) {
      inFence = !inFence;
      shell = inFence && SHELL_LANGS.has((fence[1] ?? '').toLowerCase());
      continue;
    }
    if (!inFence || !shell) continue;
    let line = raw.trim();
    if (line.startsWith('$ ')) line = line.slice(2).trim();
    if (!line || line.startsWith('#')) continue;
    if (line.length > README_COMMAND_MAX_CHARS || README_UNSAFE.test(line)) continue;
    out.push(line);
    if (out.length >= README_COMMANDS_MAX) break;
  }
  return out;
}

export function deriveCandidateCommands(snapshot: RootFilesSnapshot | null): Candidate[] {
  if (!snapshot) return [];
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (command: string, source: string): void => {
    if (seen.has(command)) return;
    seen.add(command);
    out.push({ command, source });
  };

  const pkg = parsePackageJson(snapshot.packageJson);
  if (pkg) {
    const pm = inferPackageManager(snapshot.lockfiles);
    add(`${pm} install`, 'package.json');
    for (const script of pkg.scripts) {
      if (SAFE_NAME.test(script)) add(`${pm} run ${script}`, 'package.json');
    }
  }
  if (snapshot.hasEnvExample) add('cp .env.example .env', '.env.example');
  for (const file of snapshot.composeFiles) {
    for (const service of composeServices(file.text)) {
      add(`docker compose up -d ${service}`, file.name);
    }
  }
  if (snapshot.makefile !== null) {
    for (const target of makeTargets(snapshot.makefile)) add(`make ${target}`, 'Makefile');
  }
  if (snapshot.readme) {
    const section = readmeSection(snapshot.readme.text);
    if (section) {
      for (const line of readmeShellLines(section)) add(line, snapshot.readme.name);
    }
  }
  return out.slice(0, CANDIDATE_COMMANDS_MAX);
}

export function readmeRunExcerpt(snapshot: RootFilesSnapshot | null): string | null {
  if (!snapshot?.readme) return null;
  const section = readmeSection(snapshot.readme.text);
  return section ? section.slice(0, README_EXCERPT_MAX_CHARS) : null;
}

// ---- stack / structure -----------------------------------------------------------

export function deriveStack(snapshot: RootFilesSnapshot | null, rows: RankedFileRow[]): StackFacts {
  const pkg = parsePackageJson(snapshot?.packageJson ?? null);
  const dependencies = [...new Set(pkg?.dependencies ?? [])].sort().slice(0, STACK_DEPS_MAX);
  const counts = new Map<string, number>();
  for (const r of rows) {
    const base = r.path.slice(r.path.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    if (dot <= 0) continue;
    const ext = base.slice(dot).toLowerCase();
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  const extensions = [...counts.entries()]
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count || (a.ext < b.ext ? -1 : 1))
    .slice(0, 10);
  return { dependencies, extensions };
}

export function deriveStructure(rows: RankedFileRow[]): StructureDir[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const i = r.path.indexOf('/');
    if (i <= 0) continue;
    const dir = r.path.slice(0, i);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([dir, files]) => ({ dir, files }))
    .sort((a, b) => b.files - a.files || (a.dir < b.dir ? -1 : 1))
    .slice(0, ARCH_NODES_MAX);
}

export function flattenCriticalPaths(chains: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chain of chains) {
    for (const file of chain) {
      if (seen.has(file)) continue;
      seen.add(file);
      out.push(file);
      if (out.length >= CRITICAL_PATHS_MAX) return out;
    }
  }
  return out;
}

// ---- skeleton --------------------------------------------------------------------

export interface SkeletonInput {
  structure: StructureDir[];
  criticalChains: string[][];
  candidates: Candidate[];
  readingPath: ScoredPath[];
}

export function buildSkeletonSections(input: SkeletonInput): OnboardingSections {
  return {
    architecture: {
      summary: null,
      nodes: input.structure
        .slice(0, ARCH_NODES_MAX)
        .map((d) => ({ id: d.dir, label: d.dir, path: null })),
      edges: [],
    },
    critical_paths: flattenCriticalPaths(input.criticalChains).map((path) => ({ path, why: null })),
    run_locally: input.candidates.map((c) => ({ command: c.command, note: null, source: c.source })),
    reading_path: input.readingPath.map(
      (r): OnboardingReadingPathEntry => ({ path: r.path, reason: null, score: r.score }),
    ),
    first_tasks: [],
  };
}

// ---- grounding -------------------------------------------------------------------

/** Structural shape of the validated model output (the zod schema lives in prompt.ts). */
export interface ModelSections {
  architecture: {
    summary: string;
    nodes: { id: string; label: string; path: string | null }[];
    edges: { from: string; to: string }[];
  };
  critical_paths: { path: string; why: string | null }[];
  run_locally: { command: string; note: string | null }[];
  reading_path: { path: string; reason: string | null }[];
  first_tasks: { title: string; why: string; paths: string[] }[];
}

export interface GroundingContext {
  indexed: Set<string>;
  candidates: Candidate[];
  readingPath: ScoredPath[];
  skeleton: OnboardingSections;
}

/**
 * Keeps only what the facts can back. Counts are enforced here, not by the model
 * schema. Returns how many invented paths/commands were dropped.
 */
export function groundModelSections(
  output: ModelSections,
  ctx: GroundingContext,
): { sections: OnboardingSections; droppedPaths: number } {
  let dropped = 0;

  // reading_path: deterministic set and order; only `reason` comes from the model.
  const reasonByPath = new Map<string, string | null>();
  for (const e of output.reading_path) {
    if (!ctx.indexed.has(e.path)) {
      dropped += 1;
      continue;
    }
    if (!reasonByPath.has(e.path)) reasonByPath.set(e.path, e.reason?.trim() || null);
  }
  const reading_path = ctx.readingPath.map(
    (r): OnboardingReadingPathEntry => ({
      path: r.path,
      reason: reasonByPath.get(r.path) ?? null,
      score: r.score,
    }),
  );

  // critical_paths
  const critSeen = new Set<string>();
  const critical: OnboardingSections['critical_paths'] = [];
  for (const e of output.critical_paths) {
    if (!ctx.indexed.has(e.path)) {
      dropped += 1;
      continue;
    }
    if (critSeen.has(e.path)) continue;
    critSeen.add(e.path);
    critical.push({ path: e.path, why: e.why?.trim() || null });
  }
  const critical_paths = (critical.length > 0 ? critical : ctx.skeleton.critical_paths).slice(
    0,
    CRITICAL_PATHS_MAX,
  );

  // run_locally: verbatim candidates only, then the rest in deterministic order.
  const byCommand = new Map(ctx.candidates.map((c) => [c.command, c]));
  const used = new Set<string>();
  const run_locally: OnboardingSections['run_locally'] = [];
  for (const e of output.run_locally) {
    const cand = byCommand.get(e.command);
    if (!cand) {
      dropped += 1;
      continue;
    }
    if (used.has(cand.command)) continue;
    used.add(cand.command);
    run_locally.push({ command: cand.command, note: e.note?.trim() || null, source: cand.source });
  }
  for (const c of ctx.candidates) {
    if (used.has(c.command)) continue;
    run_locally.push({ command: c.command, note: null, source: c.source });
  }

  // architecture nodes / edges
  const nodes: OnboardingSections['architecture']['nodes'] = [];
  const nodeIds = new Set<string>();
  for (const n of output.architecture.nodes) {
    if (n.path !== null && !ctx.indexed.has(n.path)) {
      dropped += 1;
      continue;
    }
    if (nodeIds.has(n.id)) continue;
    nodeIds.add(n.id);
    nodes.push({ id: n.id, label: n.label, path: n.path });
  }
  const keptNodes = nodes.slice(0, ARCH_NODES_MAX);
  const keptIds = new Set(keptNodes.map((n) => n.id));
  const edgeSeen = new Set<string>();
  const edges: OnboardingSections['architecture']['edges'] = [];
  for (const e of output.architecture.edges) {
    if (!keptIds.has(e.from) || !keptIds.has(e.to)) continue;
    const key = `${e.from}>${e.to}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    edges.push({ from: e.from, to: e.to });
  }

  // first_tasks
  const first_tasks: OnboardingSections['first_tasks'] = [];
  for (const t of output.first_tasks) {
    const paths = t.paths.filter((p) => {
      if (ctx.indexed.has(p)) return true;
      dropped += 1;
      return false;
    });
    if (paths.length === 0) continue;
    first_tasks.push({ title: t.title, why: t.why, paths });
  }

  const summary = output.architecture.summary.trim();
  return {
    sections: {
      architecture: { summary: summary || null, nodes: keptNodes, edges },
      critical_paths,
      run_locally,
      reading_path,
      first_tasks: first_tasks.slice(0, FIRST_TASKS_MAX),
    },
    droppedPaths: dropped,
  };
}
