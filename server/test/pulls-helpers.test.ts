/**
 * `modules/pulls/helpers.ts` — the pure shaping behind the PR list's FINDINGS
 * popover. The popover prints "N FINDINGS IN THIS RUN" by counting the array
 * this helper returns, so the no-drop guarantee is the point of these tests,
 * not an incidental detail.
 */
import { describe, it, expect } from 'vitest';
import {
  buildFindingPreviews,
  countedReviewIds,
  type FindingPreviewRow,
  type ReviewRollupRow,
} from '../src/modules/pulls/helpers.js';
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

/** Reviews arrive newest-first, as the route's `createdAt desc, id desc` gives them. */
function review(id: string, agentId: string | null, prId = 'pr1'): ReviewRollupRow {
  return { id, prId, agentId };
}

describe('countedReviewIds', () => {
  it("keeps only an agent's newest review, so a re-run replaces it", () => {
    const counted = countedReviewIds([
      review('r-new', 'security'),
      review('r-old', 'security'),
    ]);
    expect([...counted]).toEqual(['r-new']);
  });

  it('keeps one review per agent when several reviewed in parallel', () => {
    const counted = countedReviewIds([
      review('r-perf', 'performance'),
      review('r-sec', 'security'),
      review('r-gen', 'general'),
    ]);
    expect(counted.size).toBe(3);
  });

  it('keeps every unattributed review — a null agent cannot be superseded', () => {
    // The seeded PR #482 review is exactly this: db/seed.ts inserts it with no
    // agentId, and dropping it would empty the FINDINGS column on fresh data.
    const counted = countedReviewIds([review('r-a', null), review('r-b', null)]);
    expect([...counted].sort()).toEqual(['r-a', 'r-b']);
  });

  it('does not let one PR supersede another PR\'s review by the same agent', () => {
    const counted = countedReviewIds([
      review('r-pr1', 'security', 'pr1'),
      review('r-pr2', 'security', 'pr2'),
    ]);
    expect(counted.size).toBe(2);
  });

  it('returns an empty set for a PR with no reviews', () => {
    expect(countedReviewIds([]).size).toBe(0);
  });
});
