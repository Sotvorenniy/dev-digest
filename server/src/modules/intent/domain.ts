import { createHash } from 'node:crypto';
import type { IntentBasis, IntentClassification, IntentSource, IntentSourceKind } from '@devdigest/shared';
import { isDocUrlAllowed } from '../../ports/doc-fetcher.js';

/**
 * Intent domain rules — pure functions, no I/O. Everything extracted from PR text
 * here is UNTRUSTED: refs are bounded, paths are sanitised, hosts are allowlisted.
 */

/** Inferred intent can never claim more than this (decision: 0.45). */
export const INFERRED_CONFIDENCE_CAP = 0.45;
export const HIGH_CONFIDENCE = 0.75;
export const MEDIUM_CONFIDENCE = 0.5;

export const MAX_LINKED_ISSUES = 3;
export const MAX_DOC_LINKS = 3;
export const MAX_TICKET_KEYS = 5;
export const MAX_REQUIREMENTS = 12;
export const MAX_COMMIT_SUBJECTS = 30;
export const MAX_PATHS = 40;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= HIGH_CONFIDENCE) return 'high';
  if (confidence >= MEDIUM_CONFIDENCE) return 'medium';
  return 'low';
}

// ---- reference extraction ----------------------------------------------------

const CLOSING_REF = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d{1,7})\b/gi;
const BARE_REF = /(?:^|[\s(\[,])#(\d{1,7})\b/g;

/**
 * Up to {@link MAX_LINKED_ISSUES} same-repo issue numbers: closing-keyword refs first,
 * then same-repo issue URLs, then bare `#N`. The PR's own number is never returned.
 */
export function extractIssueRefs(text: string, repoFullName: string, ownNumber: number): number[] {
  const out: number[] = [];
  const add = (n: number) => {
    if (n > 0 && n !== ownNumber && !out.includes(n)) out.push(n);
  };
  for (const m of text.matchAll(CLOSING_REF)) add(Number(m[1]));
  const urlRe = new RegExp(
    `https://github\\.com/${escapeRe(repoFullName)}/issues/(\\d{1,7})\\b`,
    'gi',
  );
  for (const m of text.matchAll(urlRe)) add(Number(m[1]));
  for (const m of text.matchAll(BARE_REF)) add(Number(m[1]));
  return out.slice(0, MAX_LINKED_ISSUES);
}

/** Jira-style ticket keys (ABC-123); listed only, never fetched. */
export function extractTicketKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(/\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g)) keys.add(m[1]!);
  return [...keys].slice(0, MAX_TICKET_KEYS);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---- plan / spec links --------------------------------------------------------

export type DocLink =
  /** A file inside the cloned repo, read through the git port. `path` is sanitised. */
  | { via: 'repo'; kind: 'plan' | 'spec'; path: string; ref: string }
  /** An allowlisted external URL, fetched through the DocFetcher. */
  | { via: 'http'; kind: 'plan' | 'spec'; url: string; ref: string }
  /** Recognised but outside the allowlist: listed with fetched:false, never requested. */
  | { via: 'none'; kind: 'plan' | 'spec'; ref: string };

const DOC_EXT = /\.(?:md|mdx|markdown|txt|rst|adoc)$/i;
const PLAN_HINT = /(?:^|[/_.-])(?:plans?|roadmaps?)(?:[/_.-]|$)/i;
const SPEC_HINT = /(?:^|[/_.-])(?:specs?|rfcs?|adrs?|design|requirements?|proposals?|prd)(?:[/_.-]|$)/i;

function docKind(path: string): 'plan' | 'spec' | null {
  if (PLAN_HINT.test(path)) return 'plan';
  if (SPEC_HINT.test(path)) return 'spec';
  return null;
}

/**
 * Normalise a repo-relative path taken from untrusted text. Returns null when it is
 * absolute, contains `..`, backslashes, NUL, a scheme, or is not a text document.
 */
export function sanitiseRepoPath(raw: string): string | null {
  const p = raw.trim().replace(/^\.\//, '');
  if (p.length === 0 || p.length > 300) return null;
  if (p.startsWith('/') || p.includes('\\') || p.includes('\0') || /^[a-z][a-z0-9+.-]*:/i.test(p)) {
    return null;
  }
  const segs = p.split('/');
  if (segs.some((s) => s === '' || s === '..' || s === '.')) return null;
  if (!DOC_EXT.test(p)) return null;
  return segs.join('/');
}

/** A URL stripped of credentials, query and fragment — the only form we display or log. */
export function redactUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.hostname}${u.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Plan/spec links found in a PR description: same-repo GitHub blob URLs and bare
 * relative paths are read from the clone; allowlisted raw hosts are fetched; any other
 * plan/spec-looking URL is listed unfetched. Capped at {@link MAX_DOC_LINKS}.
 */
export function extractDocLinks(text: string, repoFullName: string): DocLink[] {
  const out: DocLink[] = [];
  const seen = new Set<string>();
  const push = (l: DocLink) => {
    if (out.length < MAX_DOC_LINKS && !seen.has(l.ref)) {
      seen.add(l.ref);
      out.push(l);
    }
  };
  const repoLower = repoFullName.toLowerCase();

  for (const m of text.matchAll(/https?:\/\/[^\s<>)"'\]]+/g)) {
    const url = m[0].replace(/[.,;:]+$/, '');
    const ref = redactUrl(url);
    if (!ref) continue;
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    const host = u.hostname.toLowerCase();
    // Same-repo blob link → read the file from the clone instead of the network.
    const blob = u.pathname.match(/^\/([^/]+\/[^/]+)\/blob\/[^/]+\/(.+)$/);
    if (host === 'github.com' && blob && blob[1]!.toLowerCase() === repoLower) {
      const path = sanitiseRepoPath(decodeURIComponentSafe(blob[2]!));
      const kind = path ? docKind(path) : null;
      if (path && kind) push({ via: 'repo', kind, path, ref });
      continue;
    }
    const kind = docKind(u.pathname);
    if (!kind) continue;
    if (isDocUrlAllowed(url) && DOC_EXT.test(u.pathname)) push({ via: 'http', kind, url, ref });
    else push({ via: 'none', kind, ref });
  }

  for (const m of text.matchAll(/(?:^|[\s`(\[])((?:[\w.-]+\/)*[\w.-]+\.(?:md|mdx|markdown|txt|rst|adoc))(?=$|[\s`)\].,;:])/gim)) {
    const path = sanitiseRepoPath(m[1]!);
    const kind = path ? docKind(path) : null;
    if (path && kind) push({ via: 'repo', kind, path, ref: path });
  }
  return out;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---- cache key -----------------------------------------------------------------

export interface InputsHashParts {
  title: string;
  branch: string;
  body: string;
  headSha: string;
  commitSubjects: string[];
  paths: string[];
  provider: string;
  model: string;
}

/** Hash of the DB-held inputs + the model: a changed head, text or model re-derives. */
export function computeInputsHash(parts: InputsHashParts): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

// ---- post-processing the classifier output ---------------------------------------

const DOCUMENTED_KINDS: ReadonlySet<IntentSourceKind> = new Set([
  'description',
  'issue',
  'plan',
  'spec',
]);

/** A fetched plan/spec is what unlocks requirements and "documented" spec checks. */
export function hasFetchedSpec(sources: IntentSource[]): boolean {
  return sources.some((s) => (s.kind === 'plan' || s.kind === 'spec') && s.fetched);
}

export interface FinalIntent {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  change_type: NonNullable<IntentClassification['change_type']>;
  confidence: number;
  basis: IntentBasis;
  requirements: string[];
  sources: IntentSource[];
}

/**
 * Apply the server's rules over the model's claim:
 *  - used_source_ids is filtered to ids we actually supplied;
 *  - `documented` needs a fetched documented-kind source among those used, else it is
 *    downgraded to `inferred`;
 *  - inferred confidence is capped, all confidence clamped to [0,1];
 *  - requirements survive only with a fetched plan/spec, max {@link MAX_REQUIREMENTS};
 *  - plan/spec/ticket sources are always kept so the UI can show (and warn about) them.
 */
export function finaliseIntent(c: IntentClassification, sources: IntentSource[]): FinalIntent {
  const known = new Set(sources.map((s) => s.id));
  const used = (c.used_source_ids ?? []).filter((id) => known.has(id));
  const effective = new Set(used.length > 0 ? used : sources.map((s) => s.id));

  const documentedBacked = sources.some(
    (s) => effective.has(s.id) && s.fetched && DOCUMENTED_KINDS.has(s.kind),
  );
  const basis: IntentBasis = c.basis === 'documented' && documentedBacked ? 'documented' : 'inferred';

  let confidence = Math.min(1, Math.max(0, Number.isFinite(c.confidence) ? c.confidence : 0));
  if (basis === 'inferred') confidence = Math.min(confidence, INFERRED_CONFIDENCE_CAP);

  const kept = sources.filter(
    (s) => effective.has(s.id) || ['plan', 'spec', 'ticket'].includes(s.kind),
  );

  const requirements = hasFetchedSpec(kept)
    ? (c.requirements ?? []).map((r) => r.trim()).filter(Boolean).slice(0, MAX_REQUIREMENTS)
    : [];

  return {
    intent: c.intent,
    in_scope: c.in_scope,
    out_of_scope: c.out_of_scope,
    change_type: c.change_type,
    confidence,
    basis,
    requirements,
    sources: kept,
  };
}

/** True when a plan/spec link exists but its content was not read. */
export function hasUnfetchedSpec(sources: IntentSource[]): boolean {
  return sources.some((s) => (s.kind === 'plan' || s.kind === 'spec') && !s.fetched);
}
