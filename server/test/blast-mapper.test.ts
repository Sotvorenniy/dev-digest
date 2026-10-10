/** toBlastRadius: pure mapping of the repo-intel BlastResult to the BlastRadius contract. */
import { describe, it, expect } from 'vitest';
import { toBlastRadius } from '../src/modules/blast/mapper.js';
import type { BlastResult, BlastCallerRow } from '../src/modules/repo-intel/types.js';
import { BlastRadius } from '@devdigest/shared';

const sym = (name: string, file = 'src/lib.ts') => ({ name, file, kind: 'function' });
const caller = (over: Partial<BlastCallerRow> & { viaSymbol: string }): BlastCallerRow => ({
  file: 'src/a.ts',
  symbol: 'a',
  line: 1,
  rank: 0,
  ...over,
});

describe('toBlastRadius', () => {
  it('groups callers by changed symbol, in changedSymbols order', () => {
    const r: BlastResult = {
      changedSymbols: [sym('foo'), sym('bar')],
      callers: [
        caller({ viaSymbol: 'bar', file: 'src/b.ts', symbol: 'useBar' }),
        caller({ viaSymbol: 'foo', file: 'src/a.ts', symbol: 'useFoo' }),
      ],
      impactedEndpoints: [],
    };
    const out = toBlastRadius(r);
    expect(out.downstream.map((d) => d.symbol)).toEqual(['foo', 'bar']);
    expect(out.downstream[0]!.callers).toEqual([{ name: 'useFoo', file: 'src/a.ts', line: 1 }]);
  });

  it('keeps symbols without callers in changed_symbols but omits them from downstream', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('foo'), sym('lonely')],
      callers: [caller({ viaSymbol: 'foo' })],
      impactedEndpoints: [],
    });
    expect(out.changed_symbols.map((c) => c.name)).toEqual(['foo', 'lonely']);
    expect(out.downstream.map((d) => d.symbol)).toEqual(['foo']);
  });

  it('dedupes callers by file:line:name', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('foo')],
      callers: [caller({ viaSymbol: 'foo' }), caller({ viaSymbol: 'foo' }), caller({ viaSymbol: 'foo', line: 2 })],
      impactedEndpoints: [],
    });
    expect(out.downstream[0]!.callers).toHaveLength(2);
  });

  it('sorts callers by rank desc (stable on ties) and groups by max rank desc', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('low'), sym('high')],
      callers: [
        caller({ viaSymbol: 'low', symbol: 'l1', file: 'src/l.ts', rank: 0.1 }),
        caller({ viaSymbol: 'high', symbol: 'h1', file: 'src/h1.ts', rank: 0.2 }),
        caller({ viaSymbol: 'high', symbol: 'h2', file: 'src/h2.ts', rank: 0.9 }),
        caller({ viaSymbol: 'high', symbol: 'h3', file: 'src/h3.ts', rank: 0.2 }),
      ],
      impactedEndpoints: [],
    });
    expect(out.downstream.map((d) => d.symbol)).toEqual(['high', 'low']);
    expect(out.downstream[0]!.callers.map((c) => c.name)).toEqual(['h2', 'h1', 'h3']);
  });

  it('unions endpoints/crons from factsByFile of the caller files, deduped', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('foo')],
      callers: [
        caller({ viaSymbol: 'foo', file: 'src/a.ts', symbol: 'a' }),
        caller({ viaSymbol: 'foo', file: 'src/b.ts', symbol: 'b' }),
        caller({ viaSymbol: 'foo', file: 'src/c.ts', symbol: 'c' }),
      ],
      impactedEndpoints: ['GET /x', 'GET /y', 'GET /unattributed'],
      factsByFile: {
        'src/a.ts': { endpoints: ['GET /x'], crons: ['nightly'] },
        'src/b.ts': { endpoints: ['GET /x', 'GET /y'], crons: [] },
      },
    });
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /x', 'GET /y']);
    expect(out.downstream[0]!.crons_affected).toEqual(['nightly']);
  });

  it('returns empty endpoint/cron arrays when factsByFile is absent', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('foo')],
      callers: [caller({ viaSymbol: 'foo' })],
      impactedEndpoints: ['GET /x'],
    });
    expect(out.downstream[0]!.endpoints_affected).toEqual([]);
    expect(out.downstream[0]!.crons_affected).toEqual([]);
  });

  it('builds the summary from counts', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('foo'), sym('bar')],
      callers: [caller({ viaSymbol: 'foo', file: 'src/a.ts' }), caller({ viaSymbol: 'foo', file: 'src/b.ts' })],
      impactedEndpoints: [],
      factsByFile: { 'src/a.ts': { endpoints: ['GET /x'], crons: ['c1'] } },
    });
    expect(out.summary).toBe('2 symbols, 2 callers, 1 endpoints, 1 crons');
  });

  it('passes degraded and reason through; null reason when healthy', () => {
    const d = toBlastRadius({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'flag_off' });
    expect(d.degraded).toBe(true);
    expect(d.degraded_reason).toBe('flag_off');
    const ok = toBlastRadius({ changedSymbols: [], callers: [], impactedEndpoints: [] });
    expect(ok.degraded).toBe(false);
    expect(ok.degraded_reason).toBeNull();
  });

  it('handles an empty result', () => {
    const out = toBlastRadius({ changedSymbols: [], callers: [], impactedEndpoints: [] });
    expect(out.changed_symbols).toEqual([]);
    expect(out.downstream).toEqual([]);
    expect(out.summary).toBe('0 symbols, 0 callers, 0 endpoints, 0 crons');
  });

  it('does not cap: 25 callers in, 25 out', () => {
    const callers = Array.from({ length: 25 }, (_, i) =>
      caller({ viaSymbol: 'foo', file: `src/f${i}.ts`, symbol: `s${i}` }),
    );
    const out = toBlastRadius({ changedSymbols: [sym('foo')], callers, impactedEndpoints: [] });
    expect(out.downstream[0]!.callers).toHaveLength(25);
  });

  it('output satisfies the BlastRadius contract', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('foo')],
      callers: [caller({ viaSymbol: 'foo' })],
      impactedEndpoints: [],
      factsByFile: { 'src/a.ts': { endpoints: ['GET /x'], crons: [] } },
      degraded: true,
      reason: 'index_partial',
    });
    expect(() => BlastRadius.parse(out)).not.toThrow();
  });
});
