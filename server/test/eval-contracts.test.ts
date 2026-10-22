/**
 * SPEC-06 eval contracts: server/client copies stay byte-identical, and a stored
 * EvalCaseResult jsonb (current fields only) still parses. Hermetic.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EvalCaseResult, EvalExpectationItem, EvalSetRun, RunEvalCaseDraftBody, CreateEvalCaseBody } from '@devdigest/shared';

describe('eval contracts (SPEC-06)', () => {
  it('the server and client eval.ts copies are byte-identical', () => {
    const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
    expect(read('../src/vendor/shared/contracts/eval.ts')).toBe(
      read('../../client/src/vendor/shared/contracts/eval.ts'),
    );
  });

  it('parses a stored EvalCaseResult that has only the current fields', () => {
    const stored = {
      case_id: null,
      case_name: 'sql-injection src/a.ts:10',
      expectation_type: 'must_find',
      status: 'fail',
      error: null,
      kept: [
        { file: 'src/a.ts', start_line: 1, end_line: 2, title: 't', severity: 'CRITICAL', category: 'security', is_noise: true },
      ],
      dropped: [{ file: 'src/a.ts', start_line: 99, end_line: 99, title: 'd', reason: 'not in diff' }],
      matched_items: 0,
    };
    expect(EvalCaseResult.safeParse(stored).success).toBe(true);
  });

  it('rejects an unknown status and a missing required field', () => {
    const base = {
      case_id: 'c',
      case_name: 'n',
      expectation_type: 'must_find',
      status: 'pass',
      error: null,
      kept: [],
      dropped: [],
      matched_items: 0,
    };
    expect(EvalCaseResult.safeParse({ ...base, status: 'never_run' }).success).toBe(false);
    const { matched_items: _m, ...rest } = base;
    expect(EvalCaseResult.safeParse(rest).success).toBe(false);
  });

  it('rejects an expectation item whose end_line precedes start_line', () => {
    const item = { file: 'a', start_line: 5, end_line: 4, title: 't', severity: 'CRITICAL', category: 'security' };
    expect(EvalExpectationItem.safeParse(item).success).toBe(false);
    expect(EvalExpectationItem.safeParse({ ...item, end_line: 5 }).success).toBe(true);
  });

  it('EvalSetRun accepts all-null metrics and rejects a metric above 1', () => {
    const run = {
      id: 'r',
      agent_id: 'a',
      agent_version: 1,
      model: 'm',
      strategy: 'auto',
      status: 'failed',
      started_at: 'x',
      finished_at: null,
      cases_total: 1,
      cases_passed: 0,
      cases_errored: 1,
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
      duration_ms: null,
    };
    expect(EvalSetRun.safeParse(run).success).toBe(true);
    expect(EvalSetRun.safeParse({ ...run, recall: 1.5 }).success).toBe(false);
  });

  it('bounds a saved case and a draft run (modal flow)', () => {
    const fields = {
      name: 'n',
      input_diff: 'd',
      input_files: ['a.ts'],
      input_meta: { pr_number: 1, title: 't', body: null },
      expected_output: { type: 'must_find', items: [] },
    };
    expect(RunEvalCaseDraftBody.safeParse(fields).success).toBe(true);
    expect(RunEvalCaseDraftBody.safeParse({ ...fields, input_diff: 'x'.repeat(100_001) }).success).toBe(false);
    expect(CreateEvalCaseBody.safeParse({ case: { ...fields, input_diff: 'x'.repeat(100_001) } }).success).toBe(true);
    expect(CreateEvalCaseBody.safeParse({ case: { ...fields, input_meta: { ...fields.input_meta, title: 'x'.repeat(501) } } }).success).toBe(false);
    expect(CreateEvalCaseBody.safeParse({ case: { ...fields, input_files: ['x'.repeat(501)] } }).success).toBe(false);
  });
});
