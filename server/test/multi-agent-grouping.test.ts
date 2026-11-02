import { describe, it, expect } from 'vitest';
import {
  assertAgentIdList,
  attributeFindings,
  buildConflicts,
  groupFindings,
  isAgentIdShape,
  type GroupableFinding,
} from '../src/modules/reviews/domain.js';
import { AppError } from '../src/platform/errors.js';

const g = (id: string, file: string, s: number, e: number, bucket: string): GroupableFinding => ({
  id,
  file,
  start_line: s,
  end_line: e,
  bucket,
});

describe('groupFindings (AC16)', () => {
  it('groups touching inclusive ranges [1,3]/[3,5] — fails if the overlap test becomes exclusive', () => {
    const m = groupFindings([g('a', 'x.ts', 1, 3, 'agent:A'), g('b', 'x.ts', 3, 5, 'agent:B')]);
    expect(m.get('a')!.group_key).toBe(m.get('b')!.group_key);
    expect([...m.get('a')!.member_ids].sort()).toEqual(['a', 'b']);
  });

  it('does not group [1,3]/[4,5] — fails if adjacency counts as overlap', () => {
    const m = groupFindings([g('a', 'x.ts', 1, 3, 'agent:A'), g('b', 'x.ts', 4, 5, 'agent:B')]);
    expect(m.get('a')!.group_key).not.toBe(m.get('b')!.group_key);
    expect(m.get('a')!.member_ids).toEqual(['a']);
  });

  it('never groups across files — fails if the per-file bucketing is dropped', () => {
    const m = groupFindings([g('a', 'x.ts', 1, 5, 'agent:A'), g('b', 'y.ts', 1, 5, 'agent:B')]);
    expect(m.get('a')!.group_key).not.toBe(m.get('b')!.group_key);
  });

  it('does not group findings of the same agent bucket', () => {
    const m = groupFindings([g('a', 'x.ts', 1, 5, 'agent:A'), g('b', 'x.ts', 2, 4, 'agent:A')]);
    expect(m.get('a')!.group_key).not.toBe(m.get('b')!.group_key);
  });

  it('is transitive: A-B and B-C overlap, A-C do not — fails without union-find closure', () => {
    const m = groupFindings([
      g('a', 'x.ts', 1, 2, 'agent:A'),
      g('b', 'x.ts', 2, 6, 'agent:B'),
      g('c', 'x.ts', 6, 8, 'agent:C'),
    ]);
    const keys = new Set(['a', 'b', 'c'].map((i) => m.get(i)!.group_key));
    expect(keys.size).toBe(1);
    expect([...m.get('a')!.member_ids].sort()).toEqual(['a', 'b', 'c']);
  });

  it('gives identical group_keys for shuffled input — fails if the key depends on input order', () => {
    const input = [
      g('f3', 'x.ts', 6, 8, 'agent:C'),
      g('f1', 'x.ts', 1, 2, 'agent:A'),
      g('f2', 'x.ts', 2, 6, 'agent:B'),
      g('f9', 'y.ts', 1, 1, 'agent:A'),
    ];
    const forward = groupFindings(input);
    const reversed = groupFindings([...input].reverse());
    for (const f of input) expect(reversed.get(f.id)!.group_key).toBe(forward.get(f.id)!.group_key);
    expect(forward.get('f2')!.group_key).toBe('f1');
  });

  it('gives singletons their own key', () => {
    const m = groupFindings([g('a', 'x.ts', 1, 1, 'agent:A')]);
    expect(m.get('a')).toEqual({ group_key: 'a', member_ids: ['a'] });
  });

  it('NFR1: 300 findings over 6 buckets group in well under 500 ms with no I/O', () => {
    const input: GroupableFinding[] = [];
    for (let i = 0; i < 300; i++) {
      const id = `f${String(i).padStart(4, '0')}`;
      input.push(g(id, `file${i % 5}.ts`, (i % 40) * 3, (i % 40) * 3 + 4, `agent:${i % 6}`));
    }
    const t0 = performance.now();
    const m = groupFindings(input);
    const elapsed = performance.now() - t0;
    expect(m.size).toBe(300);
    expect(elapsed).toBeLessThan(500);
  });
});

const rev = (
  id: string,
  agent_id: string | null,
  findings: { id: string; file: string; start_line: number; end_line: number }[],
  pr_id = 'pr1',
) => ({ id, agent_id, agent_name: agent_id ? `name-${agent_id}` : null, pr_id, findings });

describe('attributeFindings (AC16, AC17)', () => {
  const F = (id: string, s: number, e: number, file = 'x.ts') => ({ id, file, start_line: s, end_line: e });

  it('agreed_by names the other agent and never the finding’s own agent (AC17)', () => {
    const out = attributeFindings([
      rev('r1', 'A', [F('fa1', 1, 3), F('fa2', 2, 4)]),
      rev('r2', 'B', [F('fb', 3, 3)]),
    ]);
    const fa1 = out[0]!.findings[0]!;
    // fa1 and fa2 are same-agent: they must not list each other, only B.
    expect(fa1.agreed_by).toEqual([{ agent_id: 'B', agent_name: 'name-B', finding_id: 'fb' }]);
    expect(out[0]!.findings[1]!.agreed_by.map((a) => a.agent_id)).toEqual(['B']);
    const fb = out[1]!.findings[0]!;
    expect(fb.agreed_by.map((a) => a.agent_id)).toEqual(['A', 'A']);
    for (const r of out) {
      for (const f of r.findings) {
        expect(f.agreed_by.every((a) => a.agent_id !== f.agent_id)).toBe(true);
      }
    }
    expect(fa1.agent_name).toBe('name-A');
    expect(fa1.group_key).toBe(fb.group_key);
  });

  it('a review with no agent never agrees and is never agreed with', () => {
    const out = attributeFindings([rev('r1', 'A', [F('fa', 1, 3)]), rev('r2', null, [F('fn', 1, 3)])]);
    expect(out[0]!.findings[0]!.agreed_by).toEqual([]);
    expect(out[1]!.findings[0]!.agreed_by).toEqual([]);
    expect(out[1]!.findings[0]!.agent_id).toBeNull();
    // still grouped for display
    expect(out[0]!.findings[0]!.group_key).toBe(out[1]!.findings[0]!.group_key);
  });

  it('older reviews of the same agent get group_key null and no agreed_by (scope = newest per agent)', () => {
    const out = attributeFindings([
      rev('new', 'A', [F('fnew', 1, 3)]),
      rev('b', 'B', [F('fb', 1, 3)]),
      rev('old', 'A', [F('fold', 1, 3)]),
    ]);
    const old = out[2]!.findings[0]!;
    expect(old.group_key).toBeNull();
    expect(old.agreed_by).toEqual([]);
    // the old finding does not leak into the newest A finding's agreed_by
    expect(out[0]!.findings[0]!.agreed_by).toEqual([{ agent_id: 'B', agent_name: 'name-B', finding_id: 'fb' }]);
  });
});

describe('buildConflicts (AC15)', () => {
  const finding = (
    id: string,
    severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION',
    group_key: string | null,
    file = 'x.ts',
    s = 1,
    e = 3,
  ) => ({ id, severity, title: `t-${id}`, file, start_line: s, end_line: e, group_key });
  const col = (agent_id: string, status: string, findings: ReturnType<typeof finding>[]) => ({
    agent_id,
    agent_name: `n-${agent_id}`,
    status,
    findings,
  });

  it('marks ignored only for done columns with no finding in the group, and flags is_conflict', () => {
    const out = buildConflicts([
      col('A', 'done', [finding('a', 'CRITICAL', 'k')]),
      col('B', 'done', []),
      col('C', 'failed', []),
      col('D', 'none', []),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.is_conflict).toBe(true);
    expect(out[0]!.takes.map((t) => [t.agent_id, t.verdict])).toEqual([
      ['A', 'CRITICAL'],
      ['B', 'ignored'],
    ]);
  });

  it('is a conflict for differing severities, not when all agree', () => {
    const differ = buildConflicts([
      col('A', 'done', [finding('a', 'CRITICAL', 'k')]),
      col('B', 'done', [finding('b', 'SUGGESTION', 'k')]),
    ]);
    expect(differ[0]!.is_conflict).toBe(true);
    const same = buildConflicts([
      col('A', 'done', [finding('a', 'WARNING', 'k')]),
      col('B', 'done', [finding('b', 'WARNING', 'k')]),
    ]);
    expect(same[0]!.is_conflict).toBe(false);
  });

  it('sorts by file then line, skips ungrouped findings, and spans the group range', () => {
    const out = buildConflicts([
      col('A', 'done', [
        finding('a1', 'WARNING', 'k2', 'b.ts', 1, 2),
        finding('a2', 'WARNING', 'k1', 'a.ts', 9, 9),
        finding('a3', 'WARNING', 'k3', 'a.ts', 2, 3),
        finding('a4', 'WARNING', null, 'a.ts', 1, 1),
      ]),
      col('B', 'done', [finding('b1', 'WARNING', 'k3', 'a.ts', 3, 6)]),
    ]);
    expect(out.map((c) => c.group_key)).toEqual(['k3', 'k1', 'k2']);
    expect(out[0]).toMatchObject({ file: 'a.ts', line: 2, end_line: 6 });
  });
});

describe('assertAgentIdList (AC2)', () => {
  const thrown = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      return { code: (e as AppError).code, status: (e as AppError).statusCode };
    }
    return null;
  };

  it('rejects empty, duplicate and 7 ids with 400 invalid_run_request', () => {
    const bad = { code: 'invalid_run_request', status: 400 };
    expect(thrown(() => assertAgentIdList([]))).toEqual(bad);
    expect(thrown(() => assertAgentIdList(['a', 'a']))).toEqual(bad);
    expect(thrown(() => assertAgentIdList(['1', '2', '3', '4', '5', '6', '7']))).toEqual(bad);
  });

  it('accepts 1 and 6 distinct ids (boundary)', () => {
    expect(thrown(() => assertAgentIdList(['a']))).toBeNull();
    expect(thrown(() => assertAgentIdList(['1', '2', '3', '4', '5', '6']))).toBeNull();
  });

  it('isAgentIdShape accepts uuids only', () => {
    expect(isAgentIdShape('3f0c1a52-9c1e-4d2b-8a77-0b6f3c1d2e10')).toBe(true);
    expect(isAgentIdShape('not-a-uuid')).toBe(false);
  });
});
