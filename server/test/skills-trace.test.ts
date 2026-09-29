import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import { buildSkillTexts } from '../src/modules/reviews/helpers.js';
import {
  emptyPromptAssembly,
  estimateSkillsTokens,
  withSkillsTokens,
} from '../src/platform/trace-builder.js';
import { PromptAssembly } from '@devdigest/shared';

const COMMON = { system: 'You are a reviewer.', diff: '@@ -1 +1 @@\n+x', task: 'Review PR #1' } as const;
const link = (name: string, body: string, source = 'manual', enabled = true) => ({
  skill: { name, body, source, enabled },
});

describe('skills in the prompt assembly', () => {
  it('preserves the linked order for 2+ skills (and wraps non-manual ones as untrusted)', () => {
    const texts = buildSkillTexts([
      link('first', 'RULE-ONE'),
      link('second', 'RULE-TWO', 'imported_file'),
      link('third', 'RULE-THREE'),
    ]);
    const { assembly, messages } = assemblePrompt({ ...COMMON, skills: texts });
    const block = assembly.skills!;
    expect(block.indexOf('RULE-ONE')).toBeLessThan(block.indexOf('RULE-TWO'));
    expect(block.indexOf('RULE-TWO')).toBeLessThan(block.indexOf('RULE-THREE'));
    expect(block).toContain('<untrusted source="skill:second">');
    expect(block).not.toContain('<untrusted source="skill:first">');
    expect(messages[1]!.content).toContain('## Skills / rules');
  });

  it('a disabled skill contributes nothing; only-disabled means no skills block', () => {
    expect(buildSkillTexts([link('off', 'HIDDEN', 'manual', false)])).toEqual([]);
    const { assembly, messages } = assemblePrompt({ ...COMMON, skills: [] });
    expect(assembly.skills).toBeNull();
    expect(messages[1]!.content).not.toContain('## Skills / rules');
    expect(withSkillsTokens(assembly).skills_tokens).toBeNull();

    const mixed = buildSkillTexts([link('off', 'HIDDEN', 'manual', false), link('on', 'VISIBLE')]);
    expect(mixed).toEqual(['VISIBLE']);
  });
});

describe('skills_tokens', () => {
  it('is ceil(chars/4) of exactly the skills block, ignoring the other slots', () => {
    const { assembly } = assemblePrompt({
      ...COMMON,
      skills: ['abcde', 'fghij'], // joined with "\n\n" => 12 chars
      memory: ['a very long memory item '.repeat(50)],
    });
    expect(assembly.skills).toBe('abcde\n\nfghij');
    const out = withSkillsTokens(assembly);
    expect(out.skills_tokens).toBe(3);
    expect(estimateSkillsTokens('x'.repeat(13))).toBe(4);
    expect(out.memory).toBe(assembly.memory);
  });

  it('is null with no skills block, and old traces without the field still parse', () => {
    expect(estimateSkillsTokens(null)).toBeNull();
    expect(estimateSkillsTokens('')).toBeNull();
    expect(emptyPromptAssembly('s', 'u').skills_tokens).toBeNull();
    expect(PromptAssembly.parse({ system: 's', user: 'u', skills: 'abc' }).skills_tokens).toBeUndefined();
  });
});
