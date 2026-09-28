import { describe, it, expect } from 'vitest';
import { parseRepoUrl } from '../src/modules/repos/helpers.js';
import { SimpleGitClient } from '../src/adapters';

/**
 * `parseRepoUrl` output becomes path segments under the clone directory, and the
 * clone step `rm -rf`s that path before writing — so these are boundary tests,
 * not parser trivia.
 */

describe('parseRepoUrl: accepted forms', () => {
  it('parses the https form', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets')).toEqual({
      owner: 'acme',
      name: 'widgets',
    });
  });

  it('parses the https form with a .git suffix and a trailing slash', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets.git')).toEqual({
      owner: 'acme',
      name: 'widgets',
    });
    expect(parseRepoUrl('https://github.com/acme/widgets/')).toEqual({
      owner: 'acme',
      name: 'widgets',
    });
  });

  it('parses the scp-like ssh form', () => {
    expect(parseRepoUrl('git@github.com:acme/widgets.git')).toEqual({
      owner: 'acme',
      name: 'widgets',
    });
  });

  it('parses a repo name containing dots', () => {
    // The previous regex used [^/.]+ for the name, so this did not parse at all.
    expect(parseRepoUrl('https://github.com/vercel/next.js')).toEqual({
      owner: 'vercel',
      name: 'next.js',
    });
  });

  it('parses an owner containing hyphens', () => {
    expect(parseRepoUrl('https://github.com/my-org/my-repo')).toEqual({
      owner: 'my-org',
      name: 'my-repo',
    });
  });
});

describe('parseRepoUrl: rejected forms', () => {
  it('rejects a host that merely contains github.com in its path', () => {
    // Previously matched: the pattern was unanchored, so this cloned from evil.example.com.
    expect(() => parseRepoUrl('https://evil.example.com/github.com/acme/widgets')).toThrow(
      /Only https:\/\/github\.com/,
    );
  });

  it('rejects a lookalike host', () => {
    expect(() => parseRepoUrl('https://github.com.evil.io/acme/widgets')).toThrow(
      /Only https:\/\/github\.com/,
    );
  });

  it('rejects non-https schemes', () => {
    expect(() => parseRepoUrl('file:///tmp/github.com/a/b')).toThrow(/Only https:\/\/github\.com/);
    expect(() => parseRepoUrl('http://github.com/acme/widgets')).toThrow(
      /Only https:\/\/github\.com/,
    );
  });

  it('rejects a traversal segment in the owner position', () => {
    // Previously yielded owner '..', which escaped the clone directory.
    expect(() => parseRepoUrl('https://github.com/../widgets')).toThrow(/Could not parse/);
  });

  it('rejects a URL with no owner/repo path', () => {
    expect(() => parseRepoUrl('https://github.com/acme')).toThrow(/Could not parse/);
  });

  it('rejects a non-URL string', () => {
    expect(() => parseRepoUrl('not a url')).toThrow(/not a valid URL/);
  });
});

describe('SimpleGitClient.clonePathFor', () => {
  const client = new SimpleGitClient('/tmp/devdigest-clones');

  it('resolves a repo under the clone directory', () => {
    expect(client.clonePathFor({ owner: 'acme', name: 'widgets' })).toBe(
      '/tmp/devdigest-clones/acme/widgets',
    );
  });

  it('refuses a path that escapes the clone directory', () => {
    // Defence in depth: parseRepoUrl already rejects this, but clone() rm -rf's
    // whatever this returns, so the sink asserts containment itself.
    expect(() => client.clonePathFor({ owner: '..', name: 'evil' })).toThrow(
      /outside the clone directory/,
    );
    expect(() => client.clonePathFor({ owner: '../..', name: 'evil' })).toThrow(
      /outside the clone directory/,
    );
  });
});
