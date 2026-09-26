/**
 * `modules/pulls/helpers.ts` — the pure shaping behind the PR list's FINDINGS
 * popover. The popover prints "N FINDINGS IN THIS RUN" by counting the array
 * this helper returns, so the no-drop guarantee is the point of these tests,
 * not an incidental detail.
 */
import { describe, it, expect } from 'vitest';
import { buildFindingPreviews, type FindingPreviewRow } from '../src/modules/pulls/helpers.js';
import { PREVIEW_RATIONALE_CHARS } from '../src/modules/pulls/constants.js';

function row(over: Partial<FindingPreviewRow> = {}): FindingPreviewRow {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Something',
    file: 'src/a.ts',
    startLine: 1,
    endLine: 1,
    confidence: 0.5,
    rationale: 'because',
    ...over,
  };
}

describe('buildFindingPreviews', () => {
  it('orders CRITICAL → WARNING → SUGGESTION, most confident first within a severity', () => {
    const out = buildFindingPreviews([
      row({ id: 'sugg', severity: 'SUGGESTION' }),
      row({ id: 'warn-low', severity: 'WARNING', confidence: 0.4 }),
      row({ id: 'crit', severity: 'CRITICAL' }),
      row({ id: 'warn-high', severity: 'WARNING', confidence: 0.9 }),
    ]);
    expect(out.map((f) => f.id)).toEqual(['crit', 'warn-high', 'warn-low', 'sugg']);
  });

  it('returns every row — the popover header counts this array', () => {
    const rows = Array.from({ length: 24 }, (_, i) => row({ id: `f${i}` }));
    expect(buildFindingPreviews(rows)).toHaveLength(24);
  });

  it('truncates a long rationale but leaves a short one untouched', () => {
    const long = 'x'.repeat(PREVIEW_RATIONALE_CHARS + 50);
    const [big, small] = buildFindingPreviews([
      row({ id: 'big', rationale: long }),
      row({ id: 'small', rationale: 'short enough' }),
    ]);
    expect(big!.rationale).toHaveLength(PREVIEW_RATIONALE_CHARS + 1); // + the ellipsis
    expect(big!.rationale.endsWith('…')).toBe(true);
    expect(small!.rationale).toBe('short enough');
  });

  it('maps snake_case line fields off the camelCase DB row', () => {
    const [f] = buildFindingPreviews([row({ startLine: 45, endLine: 52 })]);
    expect(f).toMatchObject({ start_line: 45, end_line: 52 });
  });

  it('does not mutate its input', () => {
    const rows = [row({ id: 'b', severity: 'SUGGESTION' }), row({ id: 'a', severity: 'CRITICAL' })];
    buildFindingPreviews(rows);
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });
});
