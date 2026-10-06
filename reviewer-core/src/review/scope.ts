import type { Finding } from '@devdigest/shared';

/**
 * Deterministic scope filter. Runs in code, after grounding, only when an intent
 * was supplied: the model marks a finding `out_of_scope`, this decides what to do.
 *
 *  - non-CRITICAL out-of-scope findings are removed (and counted);
 *  - CRITICAL out-of-scope findings are NEVER hidden: they are kept, with a fixed
 *    title prefix, so a serious problem outside the PR's stated scope stays visible;
 *  - the caller surfaces ONE flag line (see {@link scopeFlagLine}) so the filtering
 *    itself is never silent.
 */

export const OUT_OF_SCOPE_PREFIX = '[out of scope] ';

export interface ScopeFilterResult {
  kept: Finding[];
  /** Removed non-CRITICAL out-of-scope findings (for logs / the flag line). */
  filtered: Finding[];
  /** Kept CRITICAL findings that are outside the stated scope. */
  flaggedCritical: Finding[];
}

export function applyScopeFilter(findings: Finding[]): ScopeFilterResult {
  const kept: Finding[] = [];
  const filtered: Finding[] = [];
  const flaggedCritical: Finding[] = [];
  for (const f of findings) {
    if (!f.out_of_scope) {
      kept.push(f);
    } else if (f.severity === 'CRITICAL') {
      const flagged = f.title.startsWith(OUT_OF_SCOPE_PREFIX) ? f : { ...f, title: `${OUT_OF_SCOPE_PREFIX}${f.title}` };
      kept.push(flagged);
      flaggedCritical.push(flagged);
    } else {
      filtered.push(f);
    }
  }
  return { kept, filtered, flaggedCritical };
}

/** The single, deterministic flag appended to the review summary; null when nothing happened. */
export function scopeFlagLine(r: ScopeFilterResult): string | null {
  if (r.filtered.length === 0 && r.flaggedCritical.length === 0) return null;
  const parts: string[] = [];
  if (r.filtered.length > 0) {
    parts.push(`${r.filtered.length} comment(s) outside the PR's stated scope were filtered out`);
  }
  if (r.flaggedCritical.length > 0) {
    parts.push(`${r.flaggedCritical.length} CRITICAL issue(s) outside the stated scope are kept and marked "${OUT_OF_SCOPE_PREFIX.trim()}"`);
  }
  return `Scope: ${parts.join('; ')}.`;
}
