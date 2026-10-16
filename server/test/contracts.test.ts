import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  OnboardingState,
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  SmartDiffRole,
  Conformance,
  OnboardingTour,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  PrBrief,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    // degraded fields are nullish: absent, null and populated all parse (PrBrief.blast stays valid)
    const base = { changed_symbols: [], downstream: [], summary: 's' };
    expect(() => BlastRadius.parse(base)).not.toThrow();
    expect(() => BlastRadius.parse({ ...base, degraded: null, degraded_reason: null })).not.toThrow();
    expect(BlastRadius.parse({ ...base, degraded: true, degraded_reason: 'flag_off' }).degraded_reason).toBe('flag_off');
    expect(() => BlastRadius.parse({ ...base, degraded: 'yes' })).toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('SmartDiffRole accepts tests/docs and rejects unknown roles', () => {
    for (const role of ['core', 'tests', 'wiring', 'docs', 'boilerplate']) {
      expect(SmartDiffRole.safeParse(role).success).toBe(true);
    }
    expect(SmartDiffRole.safeParse('misc').success).toBe(false);
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      OnboardingTour.parse({
        generated_at: '2026-10-14T00:00:00.000Z',
        indexed_sha: 'abc',
        files_indexed: 1,
        index_status: 'full',
        outcome: 'skeleton',
        skeleton_reason: 'no_api_key',
        churn_available: false,
        truncated: false,
        dropped_paths: 0,
        model: null,
        llm_calls: 0,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        sections: {
          architecture: { summary: null, nodes: [], edges: [] },
          critical_paths: [],
          run_locally: [],
          reading_path: [],
          first_tasks: [],
        },
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: 0.06, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
    expect(trace.stats.cost_usd).toBe(0.06);
  });

  it('RunTrace parses a stored trace with no cost_usd key', () => {
    // Traces written between migrations 0009 and 0010 have no cost at all.
    // `stats.cost_usd` is therefore optional, not merely nullable — making it
    // required would break every one of those stored documents on read.
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '{}',
      memory_pulled: [],
      specs_read: [],
      log: [],
    });
    expect(trace.stats.cost_usd ?? null).toBeNull();
  });

  describe('project_context (SPEC-01 AC13, NFR12)', () => {
    const base = {
      config: { agent: 'Security Reviewer', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 1, tokens_out: 1, findings: 0, grounding: '0/0 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '{}',
      memory_pulled: [],
      specs_read: [],
      log: [],
    };

    it('a stored trace with no project_context key still parses (old rows)', () => {
      const trace = RunTrace.parse(base);
      expect(trace.project_context ?? null).toBeNull();
    });

    it('project_context: null parses', () => {
      expect(RunTrace.parse({ ...base, project_context: null }).project_context).toBeNull();
    });

    it('parses entries with all four statuses', () => {
      const entry = (status: string, included: boolean) => ({
        path: `docs/${status}.md`,
        origin: 'agent',
        skill_name: null,
        status,
        tokens: included ? 12 : null,
        text: included ? 'doc text' : null,
      });
      const trace = RunTrace.parse({
        ...base,
        project_context: [
          entry('included', true),
          entry('missing', false),
          entry('rejected', false),
          entry('over_limit', false),
        ],
      });
      expect(trace.project_context!.map((e) => e.status)).toEqual([
        'included',
        'missing',
        'rejected',
        'over_limit',
      ]);
    });

    it('accepts a skill-origin entry with skill_name and omitted skill_name', () => {
      const e = { path: 'a.md', origin: 'skill', status: 'included', tokens: 1, text: 't' };
      expect(() => RunTrace.parse({ ...base, project_context: [{ ...e, skill_name: 'sk' }, e] })).not.toThrow();
    });

    it('rejects an unknown status', () => {
      expect(() =>
        RunTrace.parse({
          ...base,
          project_context: [{ path: 'a.md', origin: 'agent', status: 'skipped', tokens: null, text: null }],
        }),
      ).toThrow();
    });
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('SPEC-02 Onboarding contracts', () => {
  const sections = {
    architecture: {
      summary: 'Markdown summary',
      nodes: [{ id: 'n1', label: 'API', path: 'src/app.ts' }, { id: 'n2', label: 'DB', path: null }],
      edges: [{ from: 'n1', to: 'n2' }],
    },
    critical_paths: [{ path: 'src/app.ts', why: null }],
    run_locally: [{ command: 'pnpm install', note: null, source: 'package.json' }],
    reading_path: [{ path: 'src/app.ts', reason: 'entry', score: 0.5 }],
    first_tasks: [{ title: 't', why: 'w', paths: ['src/app.ts'] }],
  };
  const aiTour = {
    generated_at: '2026-10-14T00:00:00.000Z',
    indexed_sha: 'abc',
    files_indexed: 12,
    index_status: 'full',
    outcome: 'ai',
    skeleton_reason: null,
    churn_available: false,
    truncated: false,
    dropped_paths: 0,
    model: 'deepseek/deepseek-v4-flash',
    llm_calls: 1,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    sections,
  };
  const skeletonTour = {
    ...aiTour,
    outcome: 'skeleton',
    skeleton_reason: 'ai_failed',
    model: null,
    llm_calls: 0,
    tokens_in: null,
    tokens_out: null,
    sections: { ...sections, architecture: { summary: null, nodes: [], edges: [] }, first_tasks: [] },
  };
  const index = { status: 'full', usable: true, files_indexed: 12, last_indexed_sha: null };

  it('parses an ai tour and a skeleton tour', () => {
    expect(OnboardingTour.parse(aiTour).outcome).toBe('ai');
    expect(OnboardingTour.parse(skeletonTour).sections.architecture.summary).toBeNull();
  });

  it('parses OnboardingState none / generating / ready', () => {
    expect(OnboardingState.parse({ status: 'none', job_id: null, index, is_stale: false, tour: null }).status).toBe('none');
    expect(OnboardingState.parse({ status: 'generating', job_id: 'j', index, is_stale: false, tour: null }).job_id).toBe('j');
    expect(OnboardingState.parse({ status: 'ready', job_id: null, index, is_stale: true, tour: aiTour }).is_stale).toBe(true);
  });

  it('EC13: an old-shape { sections: [...] } document does not parse as a tour', () => {
    const old = { sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }] };
    expect(OnboardingTour.safeParse(old).success).toBe(false);
  });

  it('rejects llm_calls above 1 and an unknown skeleton reason', () => {
    expect(OnboardingTour.safeParse({ ...aiTour, llm_calls: 2 }).success).toBe(false);
    expect(OnboardingTour.safeParse({ ...skeletonTour, skeleton_reason: 'other' }).success).toBe(false);
  });

  it('NFR8: the Onboarding block of the server and client contract copies is identical', () => {
    const block = (p: string) => {
      const text = readFileSync(resolve(__dirname, p), 'utf8');
      const start = text.indexOf('// ---- Onboarding ----');
      const end = text.indexOf('// ---- Eval ----');
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      return text.slice(start, end);
    };
    expect(block('../src/vendor/shared/contracts/knowledge.ts')).toBe(
      block('../../client/src/vendor/shared/contracts/knowledge.ts'),
    );
  });
});

describe('PrBrief contract (SPEC-03)', () => {
  const risk = { kind: 'k', title: 't', explanation: 'e', severity: 'low' as const, file_refs: ['a.ts:1'] };
  const full = {
    summary: 's',
    intent: { intent: 'i', in_scope: [], out_of_scope: [] },
    blast: null,
    risks: { risks: [risk] },
    history: null,
    review_focus: [{ file: 'a.ts', line: 3, reason: 'r' }],
    head_sha: 'abc',
    generated_at: '2026-01-01T00:00:00.000Z',
    missing_inputs: [{ input: 'intent', reason: 'stale' }],
    specs_used: ['docs/a.md'],
    truncated: { files: 1, description: false, issue_body: true, callers: 400, blast_summary: true },
    dropped: { review_focus: 1, risks: 0, file_refs: 2 },
    model: 'm',
    tokens_in: 10,
    tokens_out: 5,
    cost_usd: 0.01,
  };

  it('parses a full fixture including truncated.callers and truncated.blast_summary', () => {
    const r = PrBrief.safeParse(full);
    expect(r.success).toBe(true);
    expect(r.data?.truncated?.callers).toBe(400);
    expect(r.data?.truncated?.blast_summary).toBe(true);
  });

  it('parses a minimal old-shape JSON (later fields are nullish)', () => {
    expect(PrBrief.safeParse({ intent: null, blast: null, risks: { risks: [] } }).success).toBe(true);
  });

  it('rejects 9 risks and 9 focus items', () => {
    expect(PrBrief.safeParse({ ...full, risks: { risks: Array(9).fill(risk) } }).success).toBe(false);
    expect(PrBrief.safeParse({ ...full, review_focus: Array(9).fill(full.review_focus[0]) }).success).toBe(false);
  });

  it('rejects focus line 0 and an unknown missing-input reason', () => {
    expect(PrBrief.safeParse({ ...full, review_focus: [{ file: 'a', line: 0, reason: 'r' }] }).success).toBe(false);
    expect(
      PrBrief.safeParse({ ...full, missing_inputs: [{ input: 'intent', reason: 'weird' }] }).success,
    ).toBe(false);
  });

  it('the server and client brief.ts copies are byte-identical', () => {
    const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
    expect(read('../src/vendor/shared/contracts/brief.ts')).toBe(
      read('../../client/src/vendor/shared/contracts/brief.ts'),
    );
  });
});
