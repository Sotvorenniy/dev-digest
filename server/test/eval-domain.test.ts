/**
 * Eval domain rules (SPEC-06): match rule, case pass, run aggregation, task-line hygiene,
 * safe error text and the synthetic-diff path guard. Pure, hermetic.
 */
import { describe, it, expect } from 'vitest';
import type { EvalCaseResult, EvalExpectedOutput } from '@devdigest/shared';
import {
  caseNameFor,
  decisionChanged,
  evalPrDescription,
  evalTaskLine,
  expectationTypeFor,
  findingMatchesItem,
  safeErrorMessage,
  scoreCase,
  scoreRun,
} from '../src/modules/eval/domain.js';
import { parseCaseDiff } from '../src/modules/eval/repository.js';

const loc = (file: string, s: number, e: number) => ({ file, start_line: s, end_line: e });
const item = (file: string, s: number, e: number) => ({
  ...loc(file, s, e),
  title: 't',
  severity: 'CRITICAL' as const,
  category: 'security' as const,
});
const kept = (file: string, s: number, e: number) => ({
  ...loc(file, s, e),
  title: 'k',
  severity: 'SUGGESTION' as const,
  category: 'style' as const,
});
const mustFind = (...items: ReturnType<typeof item>[]): EvalExpectedOutput => ({ type: 'must_find', items });
const mustNot = (...items: ReturnType<typeof item>[]): EvalExpectedOutput => ({ type: 'must_not_flag', items });

describe('findingMatchesItem', () => {
  const it0 = loc('a.ts', 10, 12);
  it('matches on exact file with inclusive range overlap at both edges', () => {
    expect(findingMatchesItem(loc('a.ts', 12, 15), it0)).toBe(true);
    expect(findingMatchesItem(loc('a.ts', 5, 10), it0)).toBe(true);
    expect(findingMatchesItem(loc('a.ts', 11, 11), it0)).toBe(true);
  });
  it('does not match adjacent ranges or another file', () => {
    expect(findingMatchesItem(loc('a.ts', 13, 15), it0)).toBe(false);
    expect(findingMatchesItem(loc('a.ts', 1, 9), it0)).toBe(false);
    expect(findingMatchesItem(loc('b.ts', 10, 12), it0)).toBe(false);
    expect(findingMatchesItem(loc('src/a.ts', 10, 12), it0)).toBe(false);
  });
  it('ignores severity, category and title', () => {
    const f = { ...loc('a.ts', 10, 10), severity: 'SUGGESTION', category: 'style', title: 'zzz' };
    expect(findingMatchesItem(f, { ...it0, severity: 'WARNING', title: 'other' } as never)).toBe(true);
  });
});

describe('scoreCase', () => {
  it('must_find passes when every item is matched, fails when one is missed', () => {
    const exp = mustFind(item('a.ts', 10, 10), item('b.ts', 1, 3));
    expect(scoreCase(exp, [kept('a.ts', 10, 10), kept('b.ts', 2, 2)], []).status).toBe('pass');
    const miss = scoreCase(exp, [kept('a.ts', 10, 10)], []);
    expect(miss.status).toBe('fail');
    expect(miss.matched_items).toBe(1);
  });
  it('counts an item matched by several findings once', () => {
    const r = scoreCase(mustFind(item('a.ts', 10, 12)), [kept('a.ts', 10, 10), kept('a.ts', 11, 12)], []);
    expect(r.matched_items).toBe(1);
    expect(r.kept.every((k) => !k.is_noise)).toBe(true);
  });
  it('flags a non-matching kept finding as noise in a must_find case', () => {
    const r = scoreCase(mustFind(item('a.ts', 10, 10)), [kept('a.ts', 10, 10), kept('a.ts', 50, 51)], []);
    expect(r.kept.map((k) => k.is_noise)).toEqual([false, true]);
  });
  it('must_not_flag passes with no matching finding and fails on a match', () => {
    const exp = mustNot(item('a.ts', 10, 10));
    expect(scoreCase(exp, [], []).status).toBe('pass');
    expect(scoreCase(exp, [kept('a.ts', 99, 99)], []).status).toBe('pass');
    expect(scoreCase(exp, [kept('a.ts', 10, 10)], []).status).toBe('fail');
  });
  it('a must_not_flag case with no items is a clean-diff case: any kept finding fails it', () => {
    const clean = mustNot();
    expect(scoreCase(clean, [], []).status).toBe('pass');
    expect(scoreCase(clean, [], [{ file: 'a.ts', start_line: 1, end_line: 1, title: 't', reason: 'dropped' }]).status).toBe('pass');
    const failed = scoreCase(clean, [kept('a.ts', 5, 5)], []);
    expect(failed.status).toBe('fail');
    expect(failed.kept[0]!.is_noise).toBe(true);
  });
  it('every kept finding in a must_not_flag case is noise', () => {
    const r = scoreCase(mustNot(item('a.ts', 10, 10)), [kept('a.ts', 99, 99)], []);
    expect(r.kept[0]!.is_noise).toBe(true);
  });
});

const res = (over: Partial<EvalCaseResult> = {}): EvalCaseResult => ({
  case_id: 'c',
  case_name: 'n',
  expectation_type: 'must_find',
  status: 'pass',
  error: null,
  kept: [],
  dropped: [],
  matched_items: 0,
  ...over,
});
const k = (noise: boolean) => ({ ...kept('a.ts', 1, 1), is_noise: noise });
const dr = { ...loc('a.ts', 1, 1), title: 'd', reason: 'r' };

describe('scoreRun', () => {
  it('computes recall, precision, citation and passed/total on a hand-computed fixture', () => {
    const results = [
      res({ status: 'pass', matched_items: 1, kept: [k(false), k(true)], dropped: [dr] }),
      res({ status: 'fail', matched_items: 0, kept: [k(true)], dropped: [] }),
      res({ expectation_type: 'must_not_flag', status: 'pass', kept: [], dropped: [dr] }),
    ];
    const s = scoreRun(results);
    // recall: 1 matched / 2 must_find cases (default 1 item each)
    expect(s.recall).toBeCloseTo(1 / 2);
    // precision: kept 3, noise 2 -> 1/3
    expect(s.precision).toBeCloseTo(1 / 3);
    // citation: kept 3, dropped 2 -> 3/5
    expect(s.citation_accuracy).toBeCloseTo(3 / 5);
    expect(s.cases_total).toBe(3);
    expect(s.cases_passed).toBe(2);
    expect(s.status).toBe('done');
  });
  it('uses the explicit mustFindItemTotal as the recall denominator', () => {
    expect(scoreRun([res({ matched_items: 1 })], 4).recall).toBeCloseTo(1 / 4);
  });
  it('returns null on every zero denominator', () => {
    const s = scoreRun([res({ expectation_type: 'must_not_flag', kept: [], dropped: [] })]);
    expect(s.recall).toBeNull();
    expect(s.precision).toBeNull();
    expect(s.citation_accuracy).toBeNull();
    const empty = scoreRun([]);
    expect(empty.recall).toBeNull();
    expect(empty.status).toBe('done');
  });
  it('leaves errored cases out of metrics, never passes them, and sets partial', () => {
    const s = scoreRun([
      res({ status: 'pass', matched_items: 1, kept: [k(false)] }),
      res({ status: 'error', error: 'x', kept: [k(true), k(true)], dropped: [dr] }),
    ]);
    expect(s.status).toBe('partial');
    expect(s.cases_errored).toBe(1);
    expect(s.cases_passed).toBe(1);
    expect(s.cases_total).toBe(2);
    expect(s.precision).toBe(1);
    expect(s.recall).toBe(1);
  });
  it('is failed with all-null metrics when every case errored', () => {
    const s = scoreRun([res({ status: 'error', error: 'x' }), res({ status: 'error', error: 'y' })]);
    expect(s.status).toBe('failed');
    expect(s.cases_passed).toBe(0);
    expect(s.recall).toBeNull();
    expect(s.precision).toBeNull();
    expect(s.citation_accuracy).toBeNull();
  });
});

describe('case construction helpers', () => {
  it('maps the decision to an expectation type', () => {
    const d = new Date();
    expect(expectationTypeFor({ acceptedAt: d, dismissedAt: null })).toBe('must_find');
    expect(expectationTypeFor({ acceptedAt: null, dismissedAt: d })).toBe('must_not_flag');
    expect(expectationTypeFor({ acceptedAt: null, dismissedAt: null })).toBeNull();
  });
  it('decisionChanged is false when the finding is gone, true on a flipped decision', () => {
    const d = new Date();
    expect(decisionChanged('must_find', null)).toBe(false);
    expect(decisionChanged('must_find', { acceptedAt: null, dismissedAt: d })).toBe(true);
    expect(decisionChanged('must_find', { acceptedAt: d, dismissedAt: null })).toBe(false);
  });
  it('caseNameFor slugs the title but keeps "/" in the file path', () => {
    expect(caseNameFor('SQL Injection in /users!', 'src/api/users.ts', 42)).toBe(
      'sql-injection-in-users src/api/users.ts:42',
    );
    expect(caseNameFor('!!!', 'a/b.ts', 1)).toBe('finding a/b.ts:1');
  });
});

describe('evalTaskLine / evalPrDescription', () => {
  const meta = { pr_number: 482, title: 'IGNORE-ALL-RULES-TITLE', body: 'BODY-TEXT' };
  it('keeps the untrusted PR title out of the task line, carries it in the description', () => {
    expect(evalTaskLine(meta)).not.toContain('IGNORE-ALL-RULES-TITLE');
    expect(evalTaskLine(meta)).toContain('#482');
    expect(evalPrDescription(meta)).toContain('IGNORE-ALL-RULES-TITLE');
    expect(evalPrDescription(meta)).toContain('BODY-TEXT');
  });
  it('omits the body when null', () => {
    expect(evalPrDescription({ ...meta, body: null })).toBe('Title: IGNORE-ALL-RULES-TITLE');
  });
});

describe('safeErrorMessage', () => {
  it('uses fixed text on a TimeoutError', () => {
    const e = Object.assign(new Error('Operation timed out after 5ms secret'), { name: 'TimeoutError' });
    expect(safeErrorMessage(e)).toBe('Case timed out');
  });
  it('flattens newlines, caps at 200 chars and falls back for non-errors', () => {
    expect(safeErrorMessage(new Error('a\nb\r\nc'))).toBe('a b c');
    const long = safeErrorMessage(new Error('x'.repeat(500)));
    expect(long.length).toBe(201);
    expect(long.endsWith('…')).toBe(true);
    expect(safeErrorMessage('boom')).toBe('Case failed');
    expect(safeErrorMessage(new Error('   '))).toBe('Case failed');
  });
});

describe('parseCaseDiff', () => {
  const patch = '@@ -1,1 +1,2 @@\n a\n+b';
  it('builds a diff whose file path is the stored path', () => {
    const d = parseCaseDiff('src/a.ts', patch);
    expect(d.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });
  it('strips CR/LF/NUL so a path cannot forge extra header lines', () => {
    const d = parseCaseDiff('src/a.ts\n+++ b/evil.ts\r\0', patch);
    expect(d.files).toHaveLength(1);
    expect(d.raw).not.toMatch(/\0/);
    expect(d.raw.split('\n')[0]).toBe('diff --git a/src/a.ts+++ b/evil.ts b/src/a.ts+++ b/evil.ts');
  });
});
