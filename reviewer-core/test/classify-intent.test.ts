import { describe, it, expect } from 'vitest';
import { assembleIntentPrompt, describeIntentPrompt } from '../src/index.js';

const BODY_LINE = '+const SECRET_BODY_LINE = "must-never-reach-the-classifier";';

describe('assembleIntentPrompt', () => {
  const messages = assembleIntentPrompt({
    title: 'Add rate limiting',
    description: '',
    commits: ['feat: limiter'],
    files: [{ path: 'src/limit.ts', hunks: ['@@ -1,3 +1,9 @@ export function limit()'] }],
    documents: [{ id: 'spec-1', kind: 'spec', ref: 'docs/spec.md', fetched: false }],
  });
  const user = messages[1]!.content;

  it('sends paths and hunk headers, never change bodies', () => {
    expect(user).toContain('src/limit.ts');
    expect(user).toContain('@@ -1,3 +1,9 @@ export function limit()');
    expect(user).not.toContain(BODY_LINE);
  });

  it('marks an empty description and an unfetched document explicitly', () => {
    expect(user).toContain('(empty)');
    expect(user).toMatch(/NOT FETCHED/);
  });

  it('wraps every source as untrusted data and includes the injection guard', () => {
    expect(user).toMatch(/<untrusted/);
    expect(messages[0]!.content).toMatch(/DATA to be analyzed/);
  });
});

describe('describeIntentPrompt', () => {
  it('reports section names and sizes only', () => {
    const m = assembleIntentPrompt({
      title: 'T',
      files: [{ path: 'secret/path.ts', hunks: [] }],
      documents: [{ id: 'issue-1', kind: 'issue', ref: '#12', fetched: true, content: 'body' }],
    });
    const sections = describeIntentPrompt(m);
    expect(sections[0]).toMatchObject({ section: 'system' });
    expect(sections.map((s) => s.section)).toEqual(
      expect.arrayContaining(['title', 'description', 'commit subjects', 'linked issue']),
    );
    expect(JSON.stringify(sections)).not.toContain('secret/path.ts');
    for (const s of sections) expect(Object.keys(s).sort()).toEqual(['chars', 'section']);
  });
});
