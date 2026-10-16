/**
 * SPEC-03 brief domain rules: grounding of untrusted model output, missing-input truth table,
 * failure classification, prompt-file selection and the F2 caps. Pure, hermetic.
 */
import { describe, it, expect } from 'vitest';
import type { BlastRadius, Risk } from '@devdigest/shared';
import {
  buildPromptFiles,
  capCallerPaths,
  classifyLlmFailure,
  computeMissingInputs,
  briefGenerationError,
  groundBrief,
  linkedIssueNumber,
  parseFileRef,
} from '../src/modules/brief/domain.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';

const PATCH = '@@ -8,3 +8,4 @@\n a\n b\n+c\n d';
const diff = parseUnifiedDiff(
  ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', PATCH].join('\n'),
);
const prPaths = new Set(['src/a.ts', 'src/nopatch.ts']);
const risk = (refs: string[], title = 't'): Risk => ({
  kind: 'k',
  title,
  explanation: 'e',
  severity: 'low',
  file_refs: refs,
});
const focus = (file: string, line: number) => ({ file, line, reason: 'r' });

describe('groundBrief', () => {
  it('AC5: keeps grounded items and counts every drop', () => {
    const out = groundBrief(
      {
        summary: 's',
        risks: [
          risk(['src/a.ts:8-10']), // kept
          risk(['ghost.ts', 'other/ghost.ts:3']), // all refs dropped -> risk dropped
        ],
        review_focus: [focus('src/a.ts', 10), focus('ghost.ts', 1), focus('src/a.ts', 999)],
      },
      { diff, prPaths, callerPaths: null },
    );
    expect(out.risks).toHaveLength(1);
    expect(out.reviewFocus).toEqual([focus('src/a.ts', 10)]);
    expect(out.dropped).toEqual({ review_focus: 2, risks: 1, file_refs: 2 });
  });

  it('AC5: null callerPaths means a caller path is not accepted; a caller set accepts it', () => {
    const input = { summary: 's', risks: [risk(['src/a.ts', 'src/caller.ts'])], review_focus: [] };
    const without = groundBrief(input, { diff, prPaths, callerPaths: null });
    expect(without.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(without.dropped.file_refs).toBe(1);
    const withCallers = groundBrief(input, { diff, prPaths, callerPaths: new Set(['src/caller.ts']) });
    expect(withCallers.risks[0]!.file_refs).toEqual(['src/a.ts', 'src/caller.ts']);
    expect(withCallers.dropped.file_refs).toBe(0);
  });

  it('EC6: a changed file without a patch grounds a risk ref but not a focus line', () => {
    const out = groundBrief(
      { summary: 's', risks: [risk(['src/nopatch.ts'])], review_focus: [focus('src/nopatch.ts', 1)] },
      { diff, prPaths, callerPaths: null },
    );
    expect(out.risks).toHaveLength(1);
    expect(out.reviewFocus).toEqual([]);
    expect(out.dropped.review_focus).toBe(1);
  });

  it('EC14: 10 grounded focus items keep 8 and drop 2', () => {
    const wide = parseUnifiedDiff(
      ['diff --git a/w.ts b/w.ts', '--- a/w.ts', '+++ b/w.ts', '@@ -1,0 +1,12 @@', ...Array(12).fill('+x')].join('\n'),
    );
    const ten = Array.from({ length: 10 }, (_, i) => focus('w.ts', i + 1));
    const out = groundBrief(
      { summary: 's', risks: [], review_focus: ten },
      { diff: wide, prPaths: new Set(['w.ts']), callerPaths: null },
    );
    expect(out.reviewFocus).toHaveLength(8);
    expect(out.dropped.review_focus).toBe(2);
  });

  it('F7f: two identical (file, line) items keep one and count the duplicate', () => {
    const out = groundBrief(
      { summary: 's', risks: [], review_focus: [focus('src/a.ts', 10), focus('src/a.ts', 10)] },
      { diff, prPaths, callerPaths: null },
    );
    expect(out.reviewFocus).toHaveLength(1);
    expect(out.dropped.review_focus).toBe(1);
  });

  it('F7f: 10 risks keep 8, count +2 in dropped.risks, and capped risks add no file_refs drops', () => {
    const risks = Array.from({ length: 10 }, (_, i) => risk(['src/a.ts'], `r${i}`));
    const out = groundBrief({ summary: 's', risks, review_focus: [] }, { diff, prPaths, callerPaths: null });
    expect(out.risks).toHaveLength(8);
    expect(out.risks.map((r) => r.title)).toEqual(risks.slice(0, 8).map((r) => r.title));
    expect(out.dropped).toEqual({ review_focus: 0, risks: 2, file_refs: 0 });
  });

  it('F7f: a duplicate ref inside one risk is counted in file_refs and kept once', () => {
    const out = groundBrief(
      { summary: 's', risks: [risk(['src/a.ts:8', 'src/a.ts:8'])], review_focus: [] },
      { diff, prPaths, callerPaths: null },
    );
    expect(out.risks[0]!.file_refs).toEqual(['src/a.ts:8']);
    expect(out.dropped.file_refs).toBe(1);
  });
});

describe('parseFileRef', () => {
  it.each([
    ['src/a.ts', { path: 'src/a.ts', range: null }],
    ['src/a.ts:12', { path: 'src/a.ts', range: '12' }],
    ['src/a.ts:10-13', { path: 'src/a.ts', range: '10-13' }],
    ['src/a.ts:abc', { path: 'src/a.ts:abc', range: null }],
    ['C:/x/a.ts:3', { path: 'C:/x/a.ts', range: '3' }],
  ])('%s', (ref, want) => {
    expect(parseFileRef(ref)).toEqual(want);
  });
});

describe('computeMissingInputs', () => {
  const base = {
    intent: { head_sha: 'h' },
    prHeadSha: 'h',
    blast: { degraded: false },
    blastFailed: false,
    specsIncluded: 1,
    description: 'd',
    issue: {},
  };
  it('nothing missing', () => {
    expect(computeMissingInputs(base)).toEqual([]);
  });
  it('intent absent vs stale', () => {
    expect(computeMissingInputs({ ...base, intent: null })).toEqual([{ input: 'intent', reason: 'absent' }]);
    expect(computeMissingInputs({ ...base, intent: { head_sha: 'old' } })).toEqual([
      { input: 'intent', reason: 'stale' },
    ]);
  });
  it('blast unavailable beats degraded; degraded alone', () => {
    expect(computeMissingInputs({ ...base, blast: null, blastFailed: true })).toEqual([
      { input: 'blast', reason: 'unavailable' },
    ]);
    expect(computeMissingInputs({ ...base, blast: { degraded: true } })).toEqual([
      { input: 'blast', reason: 'degraded' },
    ]);
  });
  it('specs, empty description, absent issue; fixed order', () => {
    expect(
      computeMissingInputs({ ...base, intent: null, specsIncluded: 0, description: '  ', issue: null }),
    ).toEqual([
      { input: 'intent', reason: 'absent' },
      { input: 'specs', reason: 'absent' },
      { input: 'description', reason: 'empty' },
      { input: 'issue', reason: 'absent' },
    ]);
  });
});

describe('classifyLlmFailure (F7b)', () => {
  const named = (name: string, message = 'x') => Object.assign(new Error(message), { name });
  it('timeouts', () => {
    expect(classifyLlmFailure(named('TimeoutError'))).toBe('timeout');
    expect(classifyLlmFailure(named('APIConnectionTimeoutError'))).toBe('timeout');
  });
  it('schema validation messages', () => {
    for (const m of [
      'OpenAI structured output failed schema validation',
      'Anthropic structured output failed schema validation',
      'OpenRouter structured output failed schema validation',
    ]) {
      expect(classifyLlmFailure(new Error(m))).toBe('schema_mismatch');
    }
  });
  it('a message that merely mentions schema is a provider error', () => {
    expect(classifyLlmFailure(new Error('invalid schema name'))).toBe('provider_error');
    expect(classifyLlmFailure('boom')).toBe('provider_error');
    expect(classifyLlmFailure(null)).toBe('provider_error');
  });
  it('briefGenerationError details are exactly { reason }, never raw output', () => {
    const e = briefGenerationError('timeout');
    expect(e.details).toEqual({ reason: 'timeout' });
  });
});

describe('linkedIssueNumber', () => {
  it.each([
    ['Closes #12', 12],
    ['fixes #3 and more', 3],
    ['see #99', 99],
    ['no refs', null],
    [null, null],
    ['', null],
  ])('%j -> %j', (body, want) => {
    expect(linkedIssueNumber(body as string | null)).toBe(want);
  });
});

describe('buildPromptFiles', () => {
  const row = (path: string, additions: number, deletions = 0) => ({ path, additions, deletions, hunks: [] });
  it('orders by size desc then path, and adds roles', () => {
    const { files, leftOut } = buildPromptFiles([
      row('b.ts', 1),
      row('docs/x.md', 5),
      row('a.ts', 1),
      row('src/big.ts', 50),
    ]);
    expect(files.map((f) => f.path)).toEqual(['src/big.ts', 'docs/x.md', 'a.ts', 'b.ts']);
    expect(leftOut).toBe(0);
    expect(files.find((f) => f.path === 'docs/x.md')!.role).toBe('docs');
  });
  it('caps at 300 and reports leftOut, keeping the biggest', () => {
    const rows = Array.from({ length: 350 }, (_, i) => row(`f${String(i).padStart(3, '0')}.ts`, i + 1));
    const { files, leftOut } = buildPromptFiles(rows);
    expect(files).toHaveLength(300);
    expect(leftOut).toBe(50);
    expect(files[0]!.path).toBe('f349.ts');
    expect(files.some((f) => f.path === 'f000.ts')).toBe(false);
  });
});

describe('capCallerPaths (F2)', () => {
  const blastWith = (callers: number, summary = 's'): BlastRadius => ({
    changed_symbols: [],
    downstream: [
      {
        symbol: 'x',
        callers: Array.from({ length: callers }, (_, i) => ({ name: 'n', file: `c${i % 500}.ts`, line: i + 1 })),
        endpoints_affected: [],
        crons_affected: [],
      },
    ],
    summary,
  });
  it('5,000 callers over 500 distinct files give 100 paths and 400 left out', () => {
    const r = capCallerPaths(blastWith(5000));
    expect(r.callerFiles).toHaveLength(100);
    expect(r.callersLeftOut).toBe(400);
    expect(r.summaryCut).toBe(false);
  });
  it('a 10,000-char summary is cut to 2,000', () => {
    const r = capCallerPaths(blastWith(1, 'x'.repeat(10_000)));
    expect(r.summary).toHaveLength(2000);
    expect(r.summaryCut).toBe(true);
  });
  it('null blast yields empties', () => {
    expect(capCallerPaths(null)).toEqual({ summary: null, callerFiles: [], summaryCut: false, callersLeftOut: 0 });
  });
});
