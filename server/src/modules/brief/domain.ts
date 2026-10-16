import type {
  BlastRadius,
  BriefDropped,
  BriefMissingInput,
  BriefReviewFocusItem,
  Finding,
  PrIntentRecord,
  Risk,
  SmartDiffRole,
  UnifiedDiff,
} from '@devdigest/shared';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';
import { groundFindings } from '../../platform/grounding.js';
import { classifyFile } from '../smart-diff/domain.js';
import {
  BRIEF_BLAST_SUMMARY_MAX_CHARS,
  BRIEF_MAX_CALLER_PATHS,
  BRIEF_MAX_FILES,
  BRIEF_MAX_FOCUS,
  BRIEF_MAX_RISKS,
} from './constants.js';

/**
 * Brief domain rules — pure functions, no I/O, no runtime zod. The model output
 * is UNTRUSTED: every file reference is checked against the PR before it is stored.
 */

/** The issue-reference rule of `GitHubClient.resolveLinkedIssue` (octokit.ts). */
export function linkedIssueNumber(body: string | null | undefined): number | null {
  if (!body) return null;
  const m = body.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
  return m?.[1] ? Number(m[1]) : null;
}

export interface MissingInputsArgs {
  intent: Pick<PrIntentRecord, 'head_sha'> | null | undefined;
  prHeadSha: string;
  blast: Pick<BlastRadius, 'degraded'> | null;
  /** True when reading the blast radius threw. */
  blastFailed: boolean;
  specsIncluded: number;
  description: string | null | undefined;
  issue: unknown | null;
}

/** Inputs that were absent, stale, degraded or empty, in a fixed order. */
export function computeMissingInputs(a: MissingInputsArgs): BriefMissingInput[] {
  const out: BriefMissingInput[] = [];
  if (!a.intent) out.push({ input: 'intent', reason: 'absent' });
  else if (a.intent.head_sha !== a.prHeadSha) out.push({ input: 'intent', reason: 'stale' });
  if (a.blastFailed) out.push({ input: 'blast', reason: 'unavailable' });
  else if (a.blast?.degraded) out.push({ input: 'blast', reason: 'degraded' });
  if (a.specsIncluded === 0) out.push({ input: 'specs', reason: 'absent' });
  if (!a.description || a.description.trim() === '') out.push({ input: 'description', reason: 'empty' });
  if (!a.issue) out.push({ input: 'issue', reason: 'absent' });
  return out;
}

export interface PromptFileRow {
  path: string;
  additions: number;
  deletions: number;
  hunks: string[];
}

/** Biggest files first (ties by path), capped, each with its smart-diff role. */
export function buildPromptFiles<T extends PromptFileRow>(
  rows: T[],
): { files: (T & { role: SmartDiffRole })[]; leftOut: number } {
  const sorted = [...rows].sort(
    (a, b) => b.additions + b.deletions - (a.additions + a.deletions) || a.path.localeCompare(b.path),
  );
  const kept = sorted.slice(0, BRIEF_MAX_FILES);
  return {
    files: kept.map((r) => ({ ...r, role: classifyFile(r.path) })),
    leftOut: sorted.length - kept.length,
  };
}

export function capCallerPaths(blast: BlastRadius | null): {
  summary: string | null;
  callerFiles: string[];
  summaryCut: boolean;
  callersLeftOut: number;
} {
  if (!blast) return { summary: null, callerFiles: [], summaryCut: false, callersLeftOut: 0 };
  const seen = new Set<string>();
  for (const d of blast.downstream) for (const c of d.callers) seen.add(c.file);
  const all = [...seen];
  const summaryCut = blast.summary.length > BRIEF_BLAST_SUMMARY_MAX_CHARS;
  return {
    summary: summaryCut ? blast.summary.slice(0, BRIEF_BLAST_SUMMARY_MAX_CHARS) : blast.summary,
    callerFiles: all.slice(0, BRIEF_MAX_CALLER_PATHS),
    summaryCut,
    callersLeftOut: Math.max(0, all.length - BRIEF_MAX_CALLER_PATHS),
  };
}

/** Splits a trailing `:N` or `:N-M` off a file reference. */
export function parseFileRef(ref: string): { path: string; range: string | null } {
  const m = ref.match(/^(.*?):(\d+(?:-\d+)?)$/);
  return m ? { path: m[1]!, range: m[2]! } : { path: ref, range: null };
}

export interface BriefModelOutputShape {
  summary: string;
  risks: Risk[];
  review_focus: { file: string; line: number; reason: string }[];
}

export interface GroundBriefCtx {
  diff: UnifiedDiff;
  prPaths: Set<string>;
  callerPaths: Set<string> | null;
}

export function groundBrief(
  output: BriefModelOutputShape,
  ctx: GroundBriefCtx,
): { risks: Risk[]; reviewFocus: BriefReviewFocusItem[]; dropped: BriefDropped } {
  // ---- review focus: dedupe -> ground -> cap ----
  const seenFocus = new Set<string>();
  const unique: BriefModelOutputShape['review_focus'] = [];
  for (const f of output.review_focus) {
    const key = `${f.file}\u0000${f.line}`;
    if (seenFocus.has(key)) continue;
    seenFocus.add(key);
    unique.push(f);
  }
  const duplicates = output.review_focus.length - unique.length;
  const asFindings: Finding[] = unique.map((f, i) => ({
    id: `focus-${i}`,
    severity: 'SUGGESTION',
    category: 'bug',
    title: '',
    file: f.file,
    start_line: f.line,
    end_line: f.line,
    rationale: '',
    confidence: 1,
    kind: null,
  }));
  const { kept } = groundFindings(asFindings, ctx.diff);
  const survivors = kept.map((k) => unique[Number(k.id.slice('focus-'.length))]!);
  const focus = survivors.slice(0, BRIEF_MAX_FOCUS);
  const groundingDrops = unique.length - survivors.length;
  const focusCapDrops = survivors.length - focus.length;

  // ---- risks: dedupe refs -> ground refs -> drop empty -> cap ----
  let fileRefsDropped = 0;
  let risksDropped = 0;
  const grounded: Risk[] = [];
  for (const risk of output.risks) {
    const refs: string[] = [];
    const seenRefs = new Set<string>();
    for (const ref of risk.file_refs) {
      if (seenRefs.has(ref)) {
        fileRefsDropped++;
        continue;
      }
      seenRefs.add(ref);
      const { path } = parseFileRef(ref);
      if (ctx.prPaths.has(path) || (ctx.callerPaths?.has(path) ?? false)) refs.push(ref);
      else fileRefsDropped++;
    }
    if (refs.length === 0) {
      risksDropped++;
      continue;
    }
    grounded.push({ ...risk, file_refs: refs });
  }
  const risks = grounded.slice(0, BRIEF_MAX_RISKS);
  risksDropped += grounded.length - risks.length;

  return {
    risks,
    reviewFocus: focus,
    dropped: {
      review_focus: duplicates + groundingDrops + focusCapDrops,
      risks: risksDropped,
      file_refs: fileRefsDropped,
    },
  };
}

export type BriefFailureReason = 'timeout' | 'schema_mismatch' | 'provider_error';

export function classifyLlmFailure(err: unknown): BriefFailureReason {
  const e = err as { name?: unknown; message?: unknown } | null;
  const name = typeof e?.name === 'string' ? e.name : '';
  const message = typeof e?.message === 'string' ? e.message : '';
  if (name === 'TimeoutError' || name === 'APIConnectionTimeoutError') return 'timeout';
  if (/structured output failed schema validation/.test(message)) return 'schema_mismatch';
  return 'provider_error';
}

/** Never carries the raw model output. */
export function briefGenerationError(reason: BriefFailureReason): ExternalServiceError {
  return new ExternalServiceError('Brief generation failed', { reason });
}

export function noFilesError(): ValidationError {
  return new ValidationError('The pull request has no changed files', { reason: 'no_files' });
}
