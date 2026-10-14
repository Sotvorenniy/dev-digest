import type { ProjectContextEntry } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { CONTEXT_RUN_MAX_TOKENS, estimateTokens, type DocRead } from '../../ports/project-docs.js';

export class ContextPathInvalidError extends AppError {
  constructor(message = 'context path is not allowed') {
    super('context_path_invalid', message, 400);
  }
}

export class CloneUnavailableError extends AppError {
  constructor(message = 'repository clone is not available') {
    super('clone_unavailable', message, 409);
  }
}

export class ContextDocNotFoundError extends AppError {
  constructor(message = 'context document not found') {
    super('context_doc_not_found', message, 404);
  }
}

export class ContextDocTooLargeError extends AppError {
  constructor(message = 'context document is too large to preview') {
    super('context_doc_too_large', message, 413);
  }
}

export class RepoNotFoundError extends AppError {
  constructor(message = 'repository not found') {
    super('repo_not_found', message, 404);
  }
}

/** More attachments than allowed, or duplicate paths. */
export class AttachmentLimitError extends AppError {
  constructor(message: string) {
    super('validation_error', message, 400);
  }
}

export interface Candidate {
  path: string;
  origin: 'agent' | 'skill';
  skillName: string | null;
}

/** Agent paths in attach order, then each skill in the given order; first occurrence of a path wins. */
export function orderCandidates(
  agentPaths: string[],
  skills: { name: string; paths: string[] }[],
): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const path of agentPaths) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, origin: 'agent', skillName: null });
  }
  for (const skill of skills) {
    for (const path of skill.paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, origin: 'skill', skillName: skill.name });
    }
  }
  return out;
}

export interface BuiltProjectContext {
  specs: { label: string; text: string }[];
  entries: ProjectContextEntry[];
  specsRead: string[];
  includedTokens: number;
}

/** Maps each candidate's read result to a trace entry, enforcing the per-run token budget. */
export function buildProjectContext(
  candidates: Candidate[],
  reads: Map<string, DocRead>,
): BuiltProjectContext {
  const specs: { label: string; text: string }[] = [];
  const entries: ProjectContextEntry[] = [];
  const specsRead: string[] = [];
  let includedTokens = 0;

  for (const c of candidates) {
    const base = { path: c.path, origin: c.origin, skill_name: c.skillName };
    const skipped = (status: 'missing' | 'rejected' | 'over_limit') =>
      entries.push({ ...base, status, tokens: null, text: null });
    const read = reads.get(c.path) ?? ({ kind: 'missing' } as DocRead);

    switch (read.kind) {
      case 'ok': {
        const tokens = estimateTokens(read.text);
        if (includedTokens + tokens > CONTEXT_RUN_MAX_TOKENS) {
          skipped('over_limit');
          break;
        }
        includedTokens += tokens;
        specs.push({ label: c.path, text: read.text });
        specsRead.push(c.path);
        entries.push({ ...base, status: 'included', tokens, text: read.text });
        break;
      }
      case 'too_large':
        skipped('over_limit');
        break;
      case 'missing':
      case 'clone_unavailable':
        skipped('missing');
        break;
      default:
        skipped('rejected');
    }
  }
  return { specs, entries, specsRead, includedTokens };
}
