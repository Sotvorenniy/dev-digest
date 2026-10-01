import { describe, it, expect } from 'vitest';
import type { Finding, UnifiedDiff } from '@devdigest/shared';
import { groundFindings, groundingSummary, buildLineIndex } from '../src/grounding.js';

/**
 * Grounding gate tests for the engine itself.
 *
 * The server has its own copy over the re-export shim, but it builds its diff by
 * parsing raw text through a server-only parser. Here the `UnifiedDiff` is
 * constructed directly so the engine stays testable without reaching across the
 * package boundary.
 */

const diff: UnifiedDiff = {
  raw: '',
  files: [
    {
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      hunks: [
        { file: 'src/config.ts', oldStart: 10, oldLines: 3, newStart: 10, newLines: 4, newLineNumbers: [10, 11, 12, 13] },
      ],
    },
    {
      path: 'src/api/users.ts',
      additions: 4,
      deletions: 0,
      hunks: [
        { file: 'src/api/users.ts', oldStart: 44, oldLines: 2, newStart: 44, newLines: 6, newLineNumbers: [44, 45, 46, 47, 48, 49] },
      ],
    },
  ],
};

function f(partial: Partial<Finding>): Finding {
  return {
    id: 'x',
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'src/config.ts',
    start_line: 12,
    end_line: 12,
    rationale: 'r',
    confidence: 0.8,
    ...partial,
  };
}

describe('buildLineIndex', () => {
  it('maps each file to the new-side lines its hunks cover', () => {
    const idx = buildLineIndex(diff);
    expect([...idx.keys()]).toEqual(['src/config.ts', 'src/api/users.ts']);
    expect(idx.get('src/config.ts')).toEqual(new Set([10, 11, 12, 13]));
  });
});

describe('citation grounding gate', () => {
  it('keeps a finding whose line intersects a hunk', () => {
    const res = groundFindings([f({ start_line: 12, end_line: 12 })], diff);
    expect(res.kept).toHaveLength(1);
    expect(res.dropped).toHaveLength(0);
  });

  it('keeps a finding whose range spans into the hunk from outside it', () => {
    // 8..11 — only 10 and 11 are covered, which is enough.
    const res = groundFindings([f({ start_line: 8, end_line: 11 })], diff);
    expect(res.kept).toHaveLength(1);
  });

  it('drops a finding whose lines miss every hunk', () => {
    const res = groundFindings([f({ start_line: 999, end_line: 999 })], diff);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/do not intersect/);
  });

  it('drops a finding whose file is absent from the diff', () => {
    const res = groundFindings([f({ file: 'src/not-here.ts' })], diff);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/not present in diff/);
  });

  it('exempts full-file kinds — they ground against the file, not a hunk', () => {
    const res = groundFindings([f({ start_line: 1, end_line: 1, kind: 'secret_leak' })], diff);
    expect(res.kept).toHaveLength(1);
  });

  it('groundingSummary reports kept/total', () => {
    const res = groundFindings(
      [f({ start_line: 12, end_line: 12 }), f({ start_line: 999, end_line: 999 })],
      diff,
    );
    expect(groundingSummary(res)).toBe('1/2 passed');
  });
});

describe('the gate cannot be defeated by an imprecise range', () => {
  it('drops a file-blanketing range instead of letting it intersect everything', () => {
    // Before the span limit this was KEPT: 1..1_000_000 covers every hunk, so a
    // model that guesses wildly scored a citation it never made.
    const res = groundFindings([f({ start_line: 1, end_line: 1_000_000 })], diff);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/over the 200-line limit/);
  });

  it('keeps a wide-but-plausible range at the limit', () => {
    const res = groundFindings([f({ start_line: 10, end_line: 209 })], diff);
    expect(res.kept).toHaveLength(1);
  });

  it('drops a non-positive range rather than scanning it', () => {
    const res = groundFindings([f({ start_line: 0, end_line: 12 })], diff);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/not a valid 1-based range/);
  });

  it('returns promptly on an absurd range instead of walking it one integer at a time', () => {
    // Regression guard: the old implementation looped lo..hi, so this input
    // burned ~16s of synchronous CPU inside the API process.
    const started = Date.now();
    const res = groundFindings([f({ start_line: 1_000_000_000, end_line: 2_000_000_000 })], diff);
    expect(res.kept).toHaveLength(0);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
