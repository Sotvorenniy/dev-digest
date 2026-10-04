/** `modules/smart-diff/domain.ts` buildSmartDiff — grouping, ordering and finding lines. */
import { describe, it, expect } from 'vitest';
import { buildSmartDiff } from '../src/modules/smart-diff/domain.js';
import { SmartDiff } from '@devdigest/shared';

const f = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });

describe('buildSmartDiff', () => {
  it('orders groups core -> tests -> wiring -> docs -> boilerplate and omits empty ones', () => {
    const d = buildSmartDiff([f('pnpm-lock.yaml'), f('README.md'), f('src/a.ts'), f('src/a.test.ts')], []);
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs', 'boilerplate']);
  });

  it('keeps input order inside a group', () => {
    const d = buildSmartDiff([f('src/z.ts'), f('src/a.ts'), f('src/m.ts')], []);
    expect(d.groups[0]!.files.map((x) => x.path)).toEqual(['src/z.ts', 'src/a.ts', 'src/m.ts']);
  });

  it('finding_lines are unique and ascending, per file', () => {
    const d = buildSmartDiff(
      [f('src/a.ts'), f('src/b.ts')],
      [
        { file: 'src/a.ts', startLine: 12 },
        { file: 'src/a.ts', startLine: 3 },
        { file: 'src/a.ts', startLine: 12 },
        { file: 'src/other.ts', startLine: 1 },
      ],
    );
    const [a, b] = d.groups[0]!.files;
    expect(a!.finding_lines).toEqual([3, 12]);
    expect(b!.finding_lines).toEqual([]);
  });

  it('sums total_lines, nulls the summary and never suggests splits', () => {
    const d = buildSmartDiff([f('a.ts', 3, 2), f('b.ts', 5, 1)], []);
    expect(d.split_suggestion).toEqual({ too_big: false, total_lines: 11, proposed_splits: [] });
    expect(d.groups[0]!.files[0]!.pseudocode_summary).toBeNull();
  });

  it('output satisfies the SmartDiff contract', () => {
    expect(() => SmartDiff.parse(buildSmartDiff([f('a.ts'), f('docs/x.md')], []))).not.toThrow();
  });

  it('an empty PR yields no groups', () => {
    expect(buildSmartDiff([], []).groups).toEqual([]);
  });
});
