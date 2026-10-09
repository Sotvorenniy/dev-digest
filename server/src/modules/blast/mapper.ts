import type { BlastRadius } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

/**
 * Pure mapping of the repo-intel facade result to the `BlastRadius` wire contract.
 * Does not cap: the facade owns every limit (`repo-intel/constants.ts`).
 */
export function toBlastRadius(result: BlastResult): BlastRadius {
  const declaringFile = new Map<string, string>();
  for (const s of result.changedSymbols) if (!declaringFile.has(s.name)) declaringFile.set(s.name, s.file);

  type Row = { name: string; file: string; line: number; rank: number };
  const bySymbol = new Map<string, Row[]>();
  const seen = new Set<string>();
  for (const c of result.callers) {
    // Defensive: a caller living in the file that declares the changed symbol is not downstream.
    if (declaringFile.get(c.viaSymbol) === c.file) continue;
    const key = `${c.viaSymbol}\0${c.file}:${c.line}:${c.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rows = bySymbol.get(c.viaSymbol) ?? [];
    rows.push({ name: c.symbol, file: c.file, line: c.line, rank: c.rank });
    bySymbol.set(c.viaSymbol, rows);
  }

  const facts = result.factsByFile;
  const groups: { symbol: string; maxRank: number; order: number; impact: BlastRadius['downstream'][number] }[] = [];
  const emitted = new Set<string>();
  let order = 0;
  for (const s of result.changedSymbols) {
    if (emitted.has(s.name)) continue;
    emitted.add(s.name);
    const rows = bySymbol.get(s.name);
    if (!rows || rows.length === 0) continue;
    // Array.prototype.sort is stable → ties keep facade order.
    const sorted = [...rows].sort((a, b) => b.rank - a.rank);
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    if (facts) {
      for (const r of sorted) {
        const f = facts[r.file];
        if (!f) continue;
        f.endpoints.forEach((e) => endpoints.add(e));
        f.crons.forEach((c) => crons.add(c));
      }
    }
    groups.push({
      symbol: s.name,
      maxRank: sorted[0]!.rank,
      order: order++,
      impact: {
        symbol: s.name,
        callers: sorted.map(({ name, file, line }) => ({ name, file, line })),
        endpoints_affected: [...endpoints],
        crons_affected: [...crons],
      },
    });
  }
  groups.sort((a, b) => b.maxRank - a.maxRank || a.order - b.order);
  const downstream = groups.map((g) => g.impact);

  const callers = downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpoints = new Set(downstream.flatMap((d) => d.endpoints_affected)).size;
  const crons = new Set(downstream.flatMap((d) => d.crons_affected)).size;

  return {
    changed_symbols: result.changedSymbols.map(({ name, file, kind }) => ({ name, file, kind })),
    downstream,
    summary: `${result.changedSymbols.length} symbols, ${callers} callers, ${endpoints} endpoints, ${crons} crons`,
    degraded: result.degraded ?? false,
    degraded_reason: result.reason ?? null,
  };
}
