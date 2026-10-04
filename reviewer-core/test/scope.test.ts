import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import {
  applyScopeFilter,
  scopeFlagLine,
  OUT_OF_SCOPE_PREFIX,
  reviewPullRequest,
  assemblePrompt,
} from '../src/index.js';

const f = (id: string, severity: Finding['severity'], out?: boolean, line = 11): Finding => ({
  id,
  severity,
  category: 'bug',
  title: `t-${id}`,
  file: 'src/config.ts',
  start_line: line,
  end_line: line,
  rationale: 'r',
  confidence: 0.9,
  kind: 'finding',
  ...(out === undefined ? {} : { out_of_scope: out }),
});

describe('applyScopeFilter', () => {
  it('drops non-CRITICAL out-of-scope findings, keeps in-scope ones', () => {
    const r = applyScopeFilter([f('a', 'WARNING', true), f('b', 'SUGGESTION', true), f('c', 'WARNING', false), f('d', 'WARNING')]);
    expect(r.kept.map((x) => x.id)).toEqual(['c', 'd']);
    expect(r.filtered.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('never hides a CRITICAL out-of-scope finding: keeps it with the prefix', () => {
    const r = applyScopeFilter([f('x', 'CRITICAL', true)]);
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0]!.title).toBe(`${OUT_OF_SCOPE_PREFIX}t-x`);
    expect(r.flaggedCritical).toHaveLength(1);
  });

  it('is idempotent on the prefix and silent when nothing is out of scope', () => {
    const once = applyScopeFilter([f('x', 'CRITICAL', true)]).kept;
    expect(applyScopeFilter(once).kept[0]!.title).toBe(`${OUT_OF_SCOPE_PREFIX}t-x`);
    expect(scopeFlagLine(applyScopeFilter([f('a', 'WARNING')]))).toBeNull();
  });
});

describe('reviewPullRequest — scope filter wiring', () => {
  const intent = { intent: 'x', in_scope: ['config'], out_of_scope: ['billing'] };
  const review = (findings: Finding[]) => ({ verdict: 'comment', summary: 'S', score: 50, findings });

  it('filters + flags only when an intent is supplied', async () => {
    const diff = await new MockGitClient().diff();
    const findings = [f('w', 'WARNING', true), f('c', 'CRITICAL', true), f('n', 'WARNING', false)];
    const withIntent = await reviewPullRequest({
      systemPrompt: 's', model: 'm', diff, intent,
      llm: new MockLLMProvider('openai', { structured: review(findings) }),
    });
    expect(withIntent.review.findings.map((x) => x.id).sort()).toEqual(['c', 'n']);
    expect(withIntent.review.summary).toMatch(/1 comment\(s\) outside the PR's stated scope were filtered out/);
    expect(withIntent.review.summary).toMatch(/1 CRITICAL issue\(s\)/);

    const without = await reviewPullRequest({
      systemPrompt: 's', model: 'm', diff,
      llm: new MockLLMProvider('openai', { structured: review(findings) }),
    });
    expect(without.review.findings).toHaveLength(3);
    expect(without.review.summary).toBe('S');
  });

  it('states "spec not fetched" in code, not just in the prompt', async () => {
    const diff = await new MockGitClient().diff();
    const out = await reviewPullRequest({
      systemPrompt: 's', model: 'm', diff,
      intent: { ...intent, sources: [{ id: 'spec-1', kind: 'spec', ref: 'docs/s.md', fetched: false }] },
      llm: new MockLLMProvider('openai', { structured: review([]) }),
    });
    expect(out.review.summary).toMatch(/Spec not fetched, conformance not verified/);
  });
});

describe('scope policy text', () => {
  it('tells the model to set out_of_scope and never to omit CRITICAL, without a title-prefix rule', () => {
    const { messages } = assemblePrompt({
      system: 'sys', diff: 'D',
      intent: { intent: 'x', in_scope: [], out_of_scope: [] },
    });
    const sys = messages[0]!.content;
    expect(sys).toMatch(/out_of_scope: true/);
    expect(sys).toMatch(/never omit a CRITICAL/i);
    expect(sys).not.toMatch(/MUST have its title prefixed/);
  });
});
