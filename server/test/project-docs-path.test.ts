import { describe, it, expect } from 'vitest';
import {
  checkContextPathSyntax,
  docTypeFor,
  estimateTokens,
  globToRegExp,
  matchesRoots,
} from '../src/ports/project-docs.js';

/** SPEC-01 AC1 (roots), AC5, NFR1 (syntax fixtures), EC17. Pure rules, no fs. */

const DEFAULT_ROOTS = ['**/{specs,docs,insights}/**/*.md'];

describe('globToRegExp / matchesRoots — default root', () => {
  it.each(['specs/a.md', 'docs/b.md', 'insights/c.md', 'x/docs/y/z.md', 'docs/specs/x.md'])(
    'matches %s',
    (p) => {
      expect(matchesRoots(p, DEFAULT_ROOTS)).toBe(true);
    },
  );

  it.each(['src/d.md', 'specs/e.txt', 'README.md', 'specsx/a.md', 'myspecs/a.md'])(
    'does not match %s',
    (p) => {
      expect(matchesRoots(p, DEFAULT_ROOTS)).toBe(false);
    },
  );

  it('"*" never crosses a "/"', () => {
    const re = globToRegExp('docs/*.md');
    expect(re.test('docs/a.md')).toBe(true);
    expect(re.test('docs/sub/a.md')).toBe(false);
  });

  it('escapes regex metacharacters in literals (a "." is a dot, not any char)', () => {
    expect(globToRegExp('docs/a.md').test('docs/aXmd')).toBe(false);
    expect(globToRegExp('docs/(a).md').test('docs/(a).md')).toBe(true);
  });

  it('a hostile root cannot throw or match everything', () => {
    expect(() => globToRegExp('([a-z+')).not.toThrow();
    expect(globToRegExp('([a-z+').test('anything.md')).toBe(false);
  });

  it('supports several roots (any match wins)', () => {
    expect(matchesRoots('notes/a.md', ['docs/**/*.md', 'notes/*.md'])).toBe(true);
  });
});

describe('docTypeFor', () => {
  it('uses the folder nearest the file (docs/specs/x.md -> specs)', () => {
    expect(docTypeFor('docs/specs/x.md', DEFAULT_ROOTS)).toBe('specs');
  });
  it('maps each default folder to itself', () => {
    expect(docTypeFor('docs/b.md', DEFAULT_ROOTS)).toBe('docs');
    expect(docTypeFor('insights/c.md', DEFAULT_ROOTS)).toBe('insights');
    expect(docTypeFor('x/docs/y/z.md', DEFAULT_ROOTS)).toBe('docs');
  });
  it('falls back to the first directory when no root names a folder', () => {
    expect(docTypeFor('notes/sub/a.md', ['**/*.md'])).toBe('notes');
  });
});

describe('checkContextPathSyntax (NFR1 fixtures)', () => {
  const bad: [string, string][] = [
    ['dot-dot prefix', '../x.md'],
    ['nested dot-dot', 'specs/../../etc/passwd.md'],
    ['absolute', '/etc/x.md'],
    ['drive letter', 'C:\\x.md'],
    ['drive letter, forward slash', 'C:/x.md'],
    ['backslash', 'specs\\a.md'],
    ['encoded dot-dot', 'specs/%2e%2e/x.md'],
    ['NUL', 'specs/a\u0000.md'],
    ['newline', 'specs/a\n.md'],
    ['DEL', 'specs/a\u007f.md'],
    ['empty', ''],
  ];
  it.each(bad)('rejects %s', (_name, p) => {
    expect(checkContextPathSyntax(p)).toBe(false);
  });

  it.each(['specs/a.md', 'docs/specs/x-y_z.md', 'a/b/c.md', 'specs/..hidden.md'])('accepts %s', (p) => {
    expect(checkContextPathSyntax(p)).toBe(true);
  });
});

describe('estimateTokens', () => {
  it('is ceil(chars / 4)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
