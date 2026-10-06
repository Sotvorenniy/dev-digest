import { describe, it, expect } from 'vitest';
import type { IntentClassification, IntentSource } from '@devdigest/shared';
import {
  CONTEXT_GAP_CONFIDENCE_CAP,
  INFERRED_CONFIDENCE_CAP,
  extractDocLinks,
  extractHunkHeaders,
  extractIssueRefs,
  finaliseIntent,
  sanitiseRepoPath,
} from '../src/modules/intent/domain.js';
import { isDocUrlAllowed } from '../src/ports/doc-fetcher.js';

const cls = (over: Partial<IntentClassification> = {}): IntentClassification => ({
  intent: 'Adds rate limiting',
  in_scope: ['limiter'],
  out_of_scope: ['billing'],
  change_type: 'feature',
  confidence: 0.95,
  basis: 'documented',
  requirements: ['limit to 10 rps'],
  used_source_ids: ['description-1', 'spec-1'],
  ...over,
});
const src = (id: string, kind: IntentSource['kind'], fetched: boolean): IntentSource => ({
  id,
  kind,
  ref: id,
  fetched,
});

describe('extractHunkHeaders', () => {
  const patch = [
    '@@ -1,3 +1,9 @@ export function limit()',
    ' context',
    '+const SECRET = "body-line";',
    '-old line',
    '@@ -40 +46,2 @@',
    '+more',
  ].join('\n');

  it('keeps only @@ headers, never change bodies', () => {
    const h = extractHunkHeaders(patch);
    expect(h).toEqual(['@@ -1,3 +1,9 @@ export function limit()', '@@ -40 +46,2 @@']);
    expect(h.join('\n')).not.toContain('SECRET');
  });

  it('handles null and caps the count', () => {
    expect(extractHunkHeaders(null)).toEqual([]);
    expect(extractHunkHeaders(Array(20).fill('@@ -1 +1 @@').join('\n'), 3)).toHaveLength(3);
  });
});

describe('finaliseIntent', () => {
  it('flags missing context in the intent itself and caps confidence when a linked spec was not read', () => {
    const f = finaliseIntent(cls(), [
      src('description-1', 'description', true),
      src('spec-1', 'spec', false),
    ]);
    expect(f.intent).toMatch(/\[Missing context: 1 linked source\(s\) could not be read \(spec\)\.\]/);
    expect(f.confidence).toBeLessThanOrEqual(CONTEXT_GAP_CONFIDENCE_CAP);
    expect(f.requirements).toEqual([]); // never invented without a fetched spec
    expect(f.sources.find((s) => s.id === 'spec-1')?.fetched).toBe(false);
  });

  it('flags an unreadable ticket / issue too', () => {
    const f = finaliseIntent(cls({ used_source_ids: ['description-1'] }), [
      src('description-1', 'description', true),
      src('ticket-1', 'ticket', false),
      src('issue-1', 'issue', false),
    ]);
    expect(f.intent).toMatch(/Missing context: 2 .*ticket, issue/);
  });

  it('does not flag when every linked source was fetched', () => {
    const f = finaliseIntent(cls(), [src('description-1', 'description', true), src('spec-1', 'spec', true)]);
    expect(f.intent).toBe('Adds rate limiting');
    expect(f.basis).toBe('documented');
    expect(f.requirements).toEqual(['limit to 10 rps']);
  });

  it('downgrades "documented" without a fetched documented source and caps inferred confidence', () => {
    const f = finaliseIntent(cls({ used_source_ids: ['title-1'] }), [src('title-1', 'title', true)]);
    expect(f.basis).toBe('inferred');
    expect(f.confidence).toBeLessThanOrEqual(INFERRED_CONFIDENCE_CAP);
  });

  it('drops source ids the server never supplied', () => {
    const f = finaliseIntent(cls({ used_source_ids: ['made-up', 'description-1'] }), [
      src('description-1', 'description', true),
      src('branch-1', 'branch', true),
    ]);
    expect(f.sources.map((s) => s.id)).toEqual(['description-1']);
  });
});

describe('untrusted link handling', () => {
  it('rejects traversal, absolute, scheme and non-document paths', () => {
    for (const bad of ['../secrets.md', '/etc/passwd.md', 'a/../b.md', 'file:///x.md', 'a\\b.md', 'src/app.ts']) {
      expect(sanitiseRepoPath(bad)).toBeNull();
    }
    expect(sanitiseRepoPath('./docs/specs/rate-limit.md')).toBe('docs/specs/rate-limit.md');
  });

  it('only allowlisted https hosts are fetchable', () => {
    expect(isDocUrlAllowed('https://raw.githubusercontent.com/o/r/main/docs/spec.md')).toBe(true);
    for (const bad of [
      'http://raw.githubusercontent.com/o/r/spec.md',
      'https://evil.example/spec.md',
      'https://user:pw@raw.githubusercontent.com/x.md',
      'https://raw.githubusercontent.com:8443/x.md',
      'https://raw.githubusercontent.com.evil.example/x.md',
    ]) {
      expect(isDocUrlAllowed(bad)).toBe(false);
    }
  });

  it('lists a non-allowlisted spec URL as unfetched instead of requesting it', () => {
    const links = extractDocLinks('Spec: https://notion.so/team/rate-limit-spec', 'o/r');
    expect(links.every((l) => l.via !== 'http')).toBe(true);
  });

  it('never returns the PR itself as a linked issue', () => {
    expect(extractIssueRefs('Fixes #5 and #7', 'o/r', 5)).toEqual([7]);
  });
});
