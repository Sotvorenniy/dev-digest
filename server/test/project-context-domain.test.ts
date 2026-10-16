import { describe, it, expect } from 'vitest';
import { buildProjectContext, groupCandidates, orderCandidates, type Candidate } from '../src/modules/project-context/domain.js';
import { CONTEXT_RUN_MAX_TOKENS, estimateTokens, type DocRead } from '../src/ports/project-docs.js';

/** SPEC-01 AC9 (order), AC10, AC11, AC13, EC11, NFR2, NFR3. Pure domain, no fakes needed. */

const ok = (text: string): DocRead => ({ kind: 'ok', text, sizeBytes: text.length, updatedAt: null });
const cand = (path: string, origin: 'agent' | 'skill' = 'agent', skillName: string | null = null): Candidate => ({
  path,
  origin,
  skillName,
});

describe('orderCandidates', () => {
  it('orders agent paths first, then each skill in the given order', () => {
    const out = orderCandidates(['specs/a.md', 'docs/b.md'], [
      { name: 's1', paths: ['docs/c.md'] },
      { name: 's2', paths: ['docs/d.md'] },
    ]);
    expect(out.map((c) => c.path)).toEqual(['specs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md']);
    expect(out.map((c) => [c.origin, c.skillName])).toEqual([
      ['agent', null],
      ['agent', null],
      ['skill', 's1'],
      ['skill', 's2'],
    ]);
  });

  it('keeps the first occurrence of a duplicate path (agent wins over skill, earlier skill over later)', () => {
    const out = orderCandidates(['specs/a.md'], [
      { name: 's1', paths: ['specs/a.md', 'docs/x.md'] },
      { name: 's2', paths: ['docs/x.md', 'docs/y.md'] },
    ]);
    expect(out).toEqual([
      cand('specs/a.md', 'agent'),
      cand('docs/x.md', 'skill', 's1'),
      cand('docs/y.md', 'skill', 's2'),
    ]);
  });

  it('dedupes inside the agent list too', () => {
    expect(orderCandidates(['a.md', 'a.md'], []).map((c) => c.path)).toEqual(['a.md']);
  });

  it('returns [] with nothing attached', () => {
    expect(orderCandidates([], [{ name: 's', paths: [] }])).toEqual([]);
  });
});

describe('buildProjectContext — statuses', () => {
  it('maps every read kind to its status and nulls tokens/text when not included', () => {
    const reads = new Map<string, DocRead>([
      ['docs/ok.md', ok('hello world!')],
      ['docs/big.md', { kind: 'too_large' }],
      ['docs/gone.md', { kind: 'missing' }],
      ['docs/noclone.md', { kind: 'clone_unavailable' }],
      ['docs/bad.md', { kind: 'invalid' }],
      ['docs/bin.md', { kind: 'not_utf8' }],
    ]);
    const built = buildProjectContext([...reads.keys()].map((p) => cand(p)), reads);
    expect(built.entries.map((e) => [e.path, e.status, e.tokens, e.text])).toEqual([
      ['docs/ok.md', 'included', 3, 'hello world!'],
      ['docs/big.md', 'over_limit', null, null],
      ['docs/gone.md', 'missing', null, null],
      ['docs/noclone.md', 'missing', null, null],
      ['docs/bad.md', 'rejected', null, null],
      ['docs/bin.md', 'rejected', null, null],
    ]);
    expect(built.specs).toEqual([{ label: 'docs/ok.md', text: 'hello world!' }]);
    expect(built.specsRead).toEqual(['docs/ok.md']);
  });

  it('treats a candidate with no read result as missing', () => {
    const built = buildProjectContext([cand('docs/a.md')], new Map());
    expect(built.entries[0]).toMatchObject({ status: 'missing', tokens: null, text: null });
  });

  it('carries origin and skill_name onto the entry', () => {
    const reads = new Map([['docs/a.md', ok('x')]]);
    const built = buildProjectContext([cand('docs/a.md', 'skill', 'my-skill')], reads);
    expect(built.entries[0]).toMatchObject({ origin: 'skill', skill_name: 'my-skill' });
  });

  it('keeps specs/specsRead in candidate order and tokens = sum of ceil(chars/4) of included text', () => {
    const texts = { 'a.md': 'x'.repeat(10), 'b.md': 'y'.repeat(401), 'c.md': 'z' };
    const reads = new Map<string, DocRead>(Object.entries(texts).map(([p, t]) => [p, ok(t)]));
    const built = buildProjectContext(Object.keys(texts).map((p) => cand(p)), reads);
    expect(built.specsRead).toEqual(['a.md', 'b.md', 'c.md']);
    const sum = built.entries.reduce((n, e) => n + (e.tokens ?? 0), 0);
    expect(sum).toBe(Object.values(texts).reduce((n, t) => n + estimateTokens(t), 0));
    expect(built.includedTokens).toBe(sum);
    for (const e of built.entries) expect(e.tokens).toBe(estimateTokens(e.text!));
  });
});

describe('buildProjectContext — 24,000 token run cap', () => {
  it('marks the doc that would cross the cap over_limit and still includes a later small one', () => {
    const big = 'x'.repeat(CONTEXT_RUN_MAX_TOKENS * 4 - 40); // 23,990 tokens
    const reads = new Map<string, DocRead>([
      ['a.md', ok(big)],
      ['b.md', ok('y'.repeat(100))], // 25 tokens, would cross 24,000
      ['c.md', ok('z'.repeat(20))], // 5 tokens, fits
    ]);
    const built = buildProjectContext(['a.md', 'b.md', 'c.md'].map((p) => cand(p)), reads);
    expect(built.entries.map((e) => [e.path, e.status])).toEqual([
      ['a.md', 'included'],
      ['b.md', 'over_limit'],
      ['c.md', 'included'],
    ]);
    expect(built.includedTokens).toBe(23_990 + 5);
    expect(built.includedTokens).toBeLessThanOrEqual(CONTEXT_RUN_MAX_TOKENS);
    expect(built.entries[1]).toMatchObject({ tokens: null, text: null });
  });

  it('allows a doc that lands exactly on the cap', () => {
    const reads = new Map<string, DocRead>([['a.md', ok('x'.repeat(CONTEXT_RUN_MAX_TOKENS * 4))]]);
    const built = buildProjectContext([cand('a.md')], reads);
    expect(built.entries[0]!.status).toBe('included');
    expect(built.includedTokens).toBe(CONTEXT_RUN_MAX_TOKENS);
  });
});

describe('groupCandidates', () => {
  const c = (path: string): Candidate => ({ path, origin: 'agent', skillName: null });
  const typeOf = (p: string) => p.split('/')[0]!;

  it('orders specs, docs, insights, then other types; stable inside each group', () => {
    const out = groupCandidates(
      [c('notes/x.md'), c('insights/i.md'), c('docs/b.md'), c('specs/a.md'), c('docs/a.md'), c('specs/z.md')],
      typeOf,
    );
    expect(out.map((x) => x.path)).toEqual([
      'specs/a.md',
      'specs/z.md',
      'docs/b.md',
      'docs/a.md',
      'insights/i.md',
      'notes/x.md',
    ]);
  });
});
