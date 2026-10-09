import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { DEFAULT_API } from '../src/constants.js';
import { log } from '../src/log.js';

describe('loadConfig', () => {
  it('uses the default URL when DEVDIGEST_API is unset', () => {
    expect(loadConfig({}).baseUrl).toBe(DEFAULT_API);
  });
  it('uses the default URL when DEVDIGEST_API is empty or blank', () => {
    expect(loadConfig({ DEVDIGEST_API: '' }).baseUrl).toBe(DEFAULT_API);
    expect(loadConfig({ DEVDIGEST_API: '   ' }).baseUrl).toBe(DEFAULT_API);
  });
  it('strips trailing slashes', () => {
    expect(loadConfig({ DEVDIGEST_API: 'http://localhost:4000//' }).baseUrl).toBe('http://localhost:4000');
  });
  it('rejects non-http protocols with a fix hint', () => {
    for (const v of ['ftp://localhost', 'file:///etc/passwd', 'javascript:alert(1)']) {
      expect(() => loadConfig({ DEVDIGEST_API: v })).toThrow(/http|set it to/);
    }
  });
  it('rejects a non-URL with a fix hint', () => {
    expect(() => loadConfig({ DEVDIGEST_API: 'not a url' })).toThrow(/set it to e\.g\./);
  });
  it('does not warn for loopback hosts', () => {
    const warn = vi.fn();
    for (const v of ['http://localhost:3001', 'http://127.0.0.1:3001', 'http://[::1]:3001']) {
      loadConfig({ DEVDIGEST_API: v }, warn);
    }
    expect(warn).not.toHaveBeenCalled();
  });
  it('warns exactly once for a non-loopback host', () => {
    const warn = vi.fn();
    loadConfig({ DEVDIGEST_API: 'https://api.example.com' }, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('api.example.com');
  });
});

describe('log', () => {
  afterEach(() => vi.restoreAllMocks());
  it('writes to stderr and never to stdout', () => {
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    log('hello');
    expect(err).toHaveBeenCalledWith(expect.stringContaining('hello'));
    expect(out).not.toHaveBeenCalled();
  });
});
