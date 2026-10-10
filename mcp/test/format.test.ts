import { describe, expect, it } from 'vitest';
import type { FindingLite, ReviewLite } from '../src/api/schemas.js';
import { clip, compact, latestReviewPerAgent, paginate, sortFindings, trimFinding } from '../src/format.js';
import { collectFindings } from '../src/tools/findings-shared.js';
import { finding, review } from './helpers/fake-api.js';

const F = (o: Record<string, unknown> = {}) => finding(o) as unknown as FindingLite;
const R = (o: Record<string, unknown> = {}) => review(o) as unknown as ReviewLite;

describe('clip', () => {
  it('collapses whitespace and appends an ellipsis only when clipped', () => {
    expect(clip('a \n  b', 10)).toBe('a b');
    expect(clip('x'.repeat(300), 200)).toBe(`${'x'.repeat(200)}…`);
    expect(clip(null, 5)).toBe('');
  });
});

describe('trimFinding', () => {
  it('clips rationale to 200 and omits suggestion and dismissal fields', () => {
    const t = trimFinding(F({ rationale: 'r'.repeat(500), suggestion: 'SECRET FIX' }));
    expect(t.rationale).toBe(`${'r'.repeat(200)}…`);
    expect(Object.keys(t)).not.toContain('suggestion');
    expect(Object.keys(t)).not.toContain('dismissed_at');
    expect(JSON.stringify(t)).not.toContain('SECRET FIX');
  });
});

describe('sortFindings', () => {
  it('sorts by severity, then file, then line, without mutating', () => {
    const input = [
      { severity: 'SUGGESTION', file: 'a', start_line: 1 },
      { severity: 'CRITICAL', file: 'b', start_line: 9 },
      { severity: 'CRITICAL', file: 'b', start_line: 2 },
      { severity: 'CRITICAL', file: 'a', start_line: 50 },
      { severity: 'WARNING', file: 'a', start_line: 1 },
    ] as const;
    const out = sortFindings(input);
    expect(out.map((f) => `${f.severity[0]}${f.file}${f.start_line}`)).toEqual([
      'Ca50', 'Cb2', 'Cb9', 'Wa1', 'Sa1',
    ]);
    expect(input[0].severity).toBe('SUGGESTION');
  });
});

describe('collectFindings', () => {
  it('excludes dismissed findings and counts them', () => {
    const r = R({ findings: [F({ id: 'a' }), F({ id: 'b', dismissed_at: '2026-01-01' })] });
    const { findings, dismissed } = collectFindings([r]);
    expect(findings.map((f) => f.id)).toEqual(['a']);
    expect(dismissed).toBe(1);
  });
  it('min_severity drops lower severities', () => {
    const r = R({
      findings: [F({ id: 'c', severity: 'CRITICAL' }), F({ id: 'w' }), F({ id: 's', severity: 'SUGGESTION' })],
    });
    expect(collectFindings([r], 'WARNING').findings.map((f) => f.id)).toEqual(['c', 'w']);
  });
});

describe('latestReviewPerAgent', () => {
  it('keeps the newest per agent and a separate bucket for null agent_id', () => {
    const out = latestReviewPerAgent([
      R({ id: 'old', agent_id: 'A', created_at: '2026-01-01T00:00:00Z' }),
      R({ id: 'new', agent_id: 'A', created_at: '2026-02-01T00:00:00Z' }),
      R({ id: 'n1', agent_id: null, created_at: '2026-01-01T00:00:00Z' }),
      R({ id: 'n2', agent_id: null, created_at: '2026-03-01T00:00:00Z' }),
      R({ id: 'b', agent_id: 'B', created_at: '2026-01-05T00:00:00Z' }),
    ]);
    const ids = out.map((r) => r.id);
    // Each null-agent review is its own bucket: both survive, and none displaces a real agent.
    expect([...ids].sort()).toEqual(['b', 'n1', 'n2', 'new']);
  });
  it('is order independent', () => {
    const out = latestReviewPerAgent([
      R({ id: 'new', agent_id: 'A', created_at: '2026-02-01T00:00:00Z' }),
      R({ id: 'old', agent_id: 'A', created_at: '2026-01-01T00:00:00Z' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['new']);
  });
});

describe('paginate', () => {
  const nums = Array.from({ length: 25 }, (_, i) => i);
  it('stops at page size and returns a decimal-offset cursor', () => {
    const p1 = paginate(nums, undefined, 10, 99999);
    expect(p1.items).toHaveLength(10);
    expect(p1.truncated).toBe(true);
    expect(p1.next_cursor).toBe('10');
    const p3 = paginate(nums, '20', 10, 99999);
    expect(p3.items).toEqual([20, 21, 22, 23, 24]);
    expect(p3.truncated).toBe(false);
    expect(p3.next_cursor).toBeUndefined();
  });
  it('stops at the character cap but always returns at least one item', () => {
    const big = Array.from({ length: 10 }, () => 'y'.repeat(100));
    const p = paginate(big, undefined, 20, 350);
    expect(p.items.length).toBe(3);
    expect(p.next_cursor).toBe('3');
    expect(paginate(big, undefined, 20, 5).items).toHaveLength(1);
  });
  it('rejects an invalid cursor and tells the caller to omit it', () => {
    for (const bad of ['abc', '-1', '1.5', '26', '99999999']) {
      expect(() => paginate(nums, bad, 10, 1000)).toThrow(/omit cursor to start over/);
    }
  });
});

describe('compact', () => {
  it('drops empty values but keeps 0 and false', () => {
    expect(compact({ a: 0, b: false, c: '', d: [], e: null, f: undefined, g: 'x' })).toEqual({
      a: 0, b: false, g: 'x',
    });
  });
});
