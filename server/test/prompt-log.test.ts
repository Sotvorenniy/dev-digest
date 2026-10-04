import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { PromptAssembly } from '@devdigest/shared';
import { PROMPT_SECTION_SOURCES, summarizePromptAssembly } from '../src/platform/prompt-log.js';
import { resolvePromptLogVerbose, loadConfig } from '../src/platform/config.js';

/**
 * Hermetic coverage of the metadata-only prompt log. The key invariant is NO
 * LEAK: the summary never contains prompt, diff, skill, spec or memory text,
 * in normal or verbose mode.
 */

const SECRET_KEY = 'sk-test-SECRET123';
const SENTINELS = {
  system: `SYSTEM-PRIVATE ${SECRET_KEY} do-not-log`,
  skills: 'SKILL-PRIVATE-BODY-alpha beta gamma',
  memory: 'MEMORY-PRIVATE-NOTE-delta',
  specs: 'SPEC-PRIVATE-TEXT epsilon zeta',
  callers: 'CALLERS-PRIVATE foo() in src/callers-secret/path.ts',
  repo_map: 'REPOMAP-PRIVATE src/repomap-secret/tree.ts',
  pr_description: 'PRBODY-PRIVATE eta theta',
  intent: 'INTENT-PRIVATE iota kappa',
  user: 'diff --git a/secret.ts b/secret.ts\n--- a/secret.ts\n+++ b/secret.ts\n@@ -1 +1 @@\n+const token = "HUNK-PRIVATE-LINE";',
} as const;

function fullAssembly(): PromptAssembly {
  return { ...SENTINELS } as PromptAssembly;
}

const sha12 = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 12);

describe('summarizePromptAssembly: shape', () => {
  it('reports section, fixed source label, chars and ceil(chars/4) tokens per present section, with correct totals', () => {
    // 5 chars -> 2 tokens, 8 chars -> 2 tokens, 9 chars -> 3 tokens.
    const a = { system: 'abcde', skills: null, memory: undefined, specs: 'abcdefgh', user: 'abcdefghi' } as PromptAssembly;
    const s = summarizePromptAssembly(a);
    expect(s.sections).toEqual([
      { section: 'system', source: 'agent_config', chars: 5, tokens_est: 2 },
      { section: 'specs', source: 'project_specs', chars: 8, tokens_est: 2 },
      { section: 'user', source: 'pr_diff+task', chars: 9, tokens_est: 3 },
    ]);
    expect(s.total_chars).toBe(22);
    expect(s.total_tokens_est).toBe(7);
    // Fails if tokens use floor/round, totals are mis-summed, or null/undefined sections are emitted.
  });

  it('omits null, undefined and empty-string sections', () => {
    const a = { system: 'x', skills: '', memory: null, callers: undefined, user: 'y' } as PromptAssembly;
    expect(summarizePromptAssembly(a).sections.map((x) => x.section)).toEqual(['system', 'user']);
    // Fails if an absent/empty section produces a zero-size entry.
  });

  it('labels every section from the fixed PROMPT_SECTION_SOURCES map, in prompt order', () => {
    const s = summarizePromptAssembly(fullAssembly());
    expect(s.sections.map((x) => x.section)).toEqual([
      'system', 'skills', 'memory', 'specs', 'callers', 'repo_map', 'pr_description', 'intent', 'user',
    ]);
    for (const sec of s.sections) expect(sec.source).toBe(PROMPT_SECTION_SOURCES[sec.section]);
    // Fails if a label is changed ad hoc or the ordering drifts from the prompt order.
  });

  it('includes diff counts only when both are provided, and omits verbose-only fields in normal mode', () => {
    const base = summarizePromptAssembly(fullAssembly(), { diffChars: 120, diffFiles: 3, skillsUsed: ['a'] });
    expect(base.diff).toEqual({ chars: 120, files: 3 });
    expect(base.skills_used).toBeUndefined();
    expect(base.skill_tokens).toBeUndefined();
    for (const sec of base.sections) {
      expect(sec.lines).toBeUndefined();
      expect(sec.sha256_12).toBeUndefined();
      expect(sec.order).toBeUndefined();
    }
    expect(summarizePromptAssembly(fullAssembly(), { diffChars: 1 }).diff).toBeUndefined();
    // Fails if verbose metadata leaks into normal mode or diff is emitted with a partial pair.
  });
});

describe('summarizePromptAssembly: NO LEAK', () => {
  const extra = {
    diffChars: SENTINELS.user.length,
    diffFiles: 1,
    skillsUsed: ['security-skill'],
    skillTexts: [{ name: 'security-skill', text: SENTINELS.skills }],
  };

  for (const verbose of [false, true]) {
    it(`never emits section text, fragments, secrets or diff paths (verbose=${verbose})`, () => {
      const json = JSON.stringify(summarizePromptAssembly(fullAssembly(), { ...extra, verbose }));

      // Whole sentinel strings, the key and the diff markers.
      for (const text of Object.values(SENTINELS)) expect(json).not.toContain(text);
      for (const needle of [
        SECRET_KEY, 'SECRET123', 'SPEC-PRIVATE-TEXT', '+++ b/secret.ts', 'secret.ts',
        'HUNK-PRIVATE-LINE', 'callers-secret', 'repomap-secret', 'PRIVATE',
      ]) {
        expect(json).not.toContain(needle);
      }
      // No 8-char window of any section text appears anywhere in the output.
      for (const text of Object.values(SENTINELS)) {
        for (let i = 0; i + 8 <= text.length; i += 1) {
          expect(json).not.toContain(text.slice(i, i + 8));
        }
      }
      // Fails if any field previews/slices/echoes section text, or a diff file path is added.
    });
  }

  it('only emits the whitelisted keys per section', () => {
    const s = summarizePromptAssembly(fullAssembly(), { ...extra, verbose: true });
    for (const sec of s.sections) {
      expect(Object.keys(sec).sort()).toEqual(['chars', 'lines', 'order', 'section', 'sha256_12', 'source', 'tokens_est']);
    }
    expect(Object.keys(s).sort()).toEqual(
      ['diff', 'sections', 'skill_tokens', 'skills_used', 'total_chars', 'total_tokens_est'],
    );
    // Fails if anyone adds a new field (e.g. `preview`, `text`) to the summary.
  });
});

describe('summarizePromptAssembly: verbose metadata', () => {
  it('adds line count, 12-hex sha256 prefix equal to the real hash, and order', () => {
    const a = { system: 'one\ntwo\nthree', skills: 'skill body', user: 'u' } as PromptAssembly;
    const s = summarizePromptAssembly(a, { verbose: true });
    expect(s.sections).toEqual([
      { section: 'system', source: 'agent_config', chars: 13, tokens_est: 4, lines: 3, sha256_12: sha12('one\ntwo\nthree'), order: 0 },
      { section: 'skills', source: 'agent_skills', chars: 10, tokens_est: 3, lines: 1, sha256_12: sha12('skill body'), order: 1 },
      { section: 'user', source: 'pr_diff+task', chars: 1, tokens_est: 1, lines: 1, sha256_12: sha12('u'), order: 2 },
    ]);
    for (const sec of s.sections) expect(sec.sha256_12).toMatch(/^[0-9a-f]{12}$/);
    // Fails if the hash is of different input, not 12 hex, lines miscounted, or order counts absent sections.
  });

  it('adds skills_used and per-skill token sizes only in verbose mode', () => {
    const extra = {
      skillsUsed: ['a', 'b'],
      skillTexts: [
        { name: 'a', text: 'abcdefgh' },
        { name: 'b', text: 'abcde' },
      ],
    };
    const v = summarizePromptAssembly({ system: 's', user: 'u' } as PromptAssembly, { ...extra, verbose: true });
    expect(v.skills_used).toEqual(['a', 'b']);
    expect(v.skill_tokens).toEqual({ a: 2, b: 2 });
    const n = summarizePromptAssembly({ system: 's', user: 'u' } as PromptAssembly, extra);
    expect(n.skills_used).toBeUndefined();
    expect(n.skill_tokens).toBeUndefined();
    // Fails if per-skill sizes use the wrong divisor or appear in normal mode.
  });

  it('keeps the non-verbose fields identical to normal mode (verbose only adds)', () => {
    const a = fullAssembly();
    const n = summarizePromptAssembly(a);
    const v = summarizePromptAssembly(a, { verbose: true });
    expect(v.total_chars).toBe(n.total_chars);
    expect(v.total_tokens_est).toBe(n.total_tokens_est);
    expect(v.sections.map(({ section, source, chars, tokens_est }) => ({ section, source, chars, tokens_est }))).toEqual(n.sections);
    // Fails if verbose mode changes the base measurements.
  });
});

describe('resolvePromptLogVerbose', () => {
  it.each(['127.0.0.1', 'localhost', '::1', '[::1]', 'LOCALHOST'])(
    'requested + development + loopback %s -> on',
    (host) => {
      expect(resolvePromptLogVerbose(true, 'development', host)).toEqual({ enabled: true, ignoredReason: null });
    },
  );

  it('requested + development + 0.0.0.0 -> off with an API_HOST reason', () => {
    const r = resolvePromptLogVerbose(true, 'development', '0.0.0.0');
    expect(r.enabled).toBe(false);
    expect(r.ignoredReason).toContain('API_HOST');
  });

  it.each(['production', 'test'])('requested + %s + loopback -> off with a NODE_ENV reason', (env) => {
    const r = resolvePromptLogVerbose(true, env, '127.0.0.1');
    expect(r.enabled).toBe(false);
    expect(r.ignoredReason).toContain('NODE_ENV');
  });

  it.each([
    ['development', '127.0.0.1'],
    ['production', '0.0.0.0'],
    ['test', 'localhost'],
  ])('not requested (%s, %s) -> off, no reason', (env, host) => {
    expect(resolvePromptLogVerbose(false, env, host)).toEqual({ enabled: false, ignoredReason: null });
  });
  // Each case fails if the gate (requested / development / loopback) is loosened or the reason text lost.
});

describe('loadConfig: prompt-log wiring', () => {
  const base = { DATABASE_URL: 'postgres://x/y' } as NodeJS.ProcessEnv;

  it('defaults API_HOST to 0.0.0.0 (also for empty string) and ignores verbose there', () => {
    for (const host of [undefined, '']) {
      const c = loadConfig({ ...base, NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'true', ...(host !== undefined ? { API_HOST: host } : {}) });
      expect(c.apiHost).toBe('0.0.0.0');
      expect(c.promptLogVerbose).toBe(false);
      expect(c.promptLogVerboseIgnoredReason).toContain('API_HOST');
    }
  });

  it('turns verbose on only for development + loopback, and exposes no reason then', () => {
    const c = loadConfig({ ...base, NODE_ENV: 'development', API_HOST: '127.0.0.1', PROMPT_LOG_VERBOSE: 'true' });
    expect(c.promptLogVerbose).toBe(true);
    expect(c.promptLogVerboseIgnoredReason).toBeNull();
    const off = loadConfig({ ...base, NODE_ENV: 'development', API_HOST: '127.0.0.1' });
    expect(off.promptLogVerbose).toBe(false);
    expect(off.promptLogVerboseIgnoredReason).toBeNull();
    // Fails if loadConfig stops passing API_HOST/NODE_ENV into the resolver, or treats a non-"true" value as requested.
  });
});
