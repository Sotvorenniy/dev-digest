import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../src/platform/redact.js';

/**
 * `jobs.error` is durable and nothing reviews what lands in it, so these cases
 * are the shapes a credential would realistically take on the way there.
 */

describe('redactSecrets', () => {
  it('strips credentials from a git remote URL', () => {
    const out = redactSecrets(
      "fatal: could not read from 'https://x-access-token:ghp_abcdefghijklmnopqrst@github.com/acme/x.git'",
    );
    expect(out).not.toContain('ghp_abcdefghijklmnopqrst');
    expect(out).not.toContain('x-access-token');
    expect(out).toContain('https://***@github.com/acme/x.git');
  });

  it('strips an Authorization header value', () => {
    const out = redactSecrets('git -c http.extraHeader=Authorization: Basic eGFjY2Vzczpna_AA123 failed');
    expect(out).toContain('Authorization: Basic ***');
    expect(out).not.toContain('eGFjY2Vzczpna_AA123');
  });

  it('strips bare provider tokens', () => {
    expect(redactSecrets('token ghp_0123456789abcdefghij rejected')).toBe(
      'token ghp_*** rejected',
    );
    expect(redactSecrets('key sk-proj-0123456789abcdefghij is invalid')).toBe(
      'key sk-proj-*** is invalid',
    );
  });

  it('leaves ordinary error text alone', () => {
    const msg = "fatal: repository 'https://github.com/acme/x.git' not found";
    expect(redactSecrets(msg)).toBe(msg);
  });

  it('handles several secrets in one message', () => {
    const out = redactSecrets(
      'https://user:ghp_0123456789abcdefghij@github.com failed; retry with ghp_zyxwvutsrqponmlkjihg',
    );
    expect(out).not.toMatch(/ghp_[A-Za-z0-9]{16,}/);
  });
});
