import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, createApiClient, idPath } from '../src/api/client.js';
import { BASE, REPO_ID, fakeFetch } from './helpers/fake-api.js';

const Obj = z.object({ a: z.number() });

async function fail(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('expected rejection');
}

const hangingFetch = ((_u: unknown, init?: RequestInit) =>
  new Promise((_res, rej) => {
    init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
  })) as unknown as typeof fetch;

describe('createApiClient', () => {
  it('joins base and path without double slashes and parses the body', async () => {
    const { fetch, calls } = fakeFetch({ 'GET /x': { body: { a: 1, extra: 'stripped' } } });
    const api = createApiClient({ baseUrl: `${BASE}//`, fetch });
    expect(await api.get('/x', Obj)).toEqual({ a: 1 });
    expect(calls[0]?.path).toBe('/x');
  });

  it('sends a JSON body with a content-type on POST', async () => {
    let seen: RequestInit | undefined;
    const fetch = (async (_u: unknown, init?: RequestInit) => {
      seen = init;
      return new Response('{"a":2}', { status: 200 });
    }) as typeof globalThis.fetch;
    const api = createApiClient({ baseUrl: BASE, fetch });
    await api.post('/p', { all: true }, Obj);
    expect(seen?.method).toBe('POST');
    expect(seen?.body).toBe('{"all":true}');
    expect((seen?.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('maps a fetch TypeError to unreachable and names the start command', async () => {
    const fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof globalThis.fetch;
    const e = await fail(createApiClient({ baseUrl: BASE, fetch }).get('/x', Obj));
    expect(e.kind).toBe('unreachable');
    expect(e.message).toContain(`not reachable at ${BASE}`);
    expect(e.message).toContain('start the server');
  });

  it('maps 404 to not_found keeping the envelope message plus a next step', async () => {
    const { fetch } = fakeFetch({
      'GET /x': { status: 404, body: { error: { code: 'nf', message: 'Repo gone' } } },
    });
    const e = await fail(createApiClient({ baseUrl: BASE, fetch }).get('/x', Obj));
    expect(e.kind).toBe('not_found');
    expect(e.status).toBe(404);
    expect(e.message).toMatch(/^Repo gone; check /);
  });

  it('maps 422 to invalid with a next step', async () => {
    const { fetch } = fakeFetch({ 'GET /x': { status: 422, body: { error: { message: 'bad uuid details' } } } });
    const e = await fail(createApiClient({ baseUrl: BASE, fetch }).get('/x', Obj));
    expect(e.kind).toBe('invalid');
    expect(e.message).toMatch(/^invalid id or input; check /);
    expect(e.message).not.toContain('bad uuid details');
  });

  it('maps 429 to rate_limited with the wait hint', async () => {
    const { fetch } = fakeFetch({ 'POST /x': { status: 429, body: {} } });
    const e = await fail(createApiClient({ baseUrl: BASE, fetch }).post('/x', {}, Obj));
    expect(e.kind).toBe('rate_limited');
    expect(e.message).toBe('rate limited by API (review: 10/min); wait ~60s, then retry');
  });

  it('maps 5xx without leaking the response body', async () => {
    const { fetch } = fakeFetch({ 'GET /x': { status: 500, raw: 'SECRET stack trace at db.ts:1' } });
    const e = await fail(createApiClient({ baseUrl: BASE, fetch }).get('/x', Obj));
    expect(e.kind).toBe('server_error');
    expect(e.message).toContain('API error 500');
    expect(e.message).not.toContain('SECRET');
    expect(e.message).toMatch(/retry/);
  });

  it('clips other 4xx envelope messages to 200 chars and adds a next step', async () => {
    const long = 'x'.repeat(500);
    const { fetch } = fakeFetch({ 'GET /x': { status: 400, body: { error: { message: long } } } });
    const e = await fail(createApiClient({ baseUrl: BASE, fetch }).get('/x', Obj));
    expect(e.kind).toBe('client_error');
    expect(e.message).not.toContain('x'.repeat(201));
    expect(e.message).toMatch(/check the arguments/);
  });

  it('maps a request timeout to timeout with a retry hint', async () => {
    const e = await fail(createApiClient({ baseUrl: BASE, fetch: hangingFetch, timeoutMs: 20 }).get('/x', Obj));
    expect(e.kind).toBe('timeout');
    expect(e.message).toMatch(/timed out after \d+s; retry/);
  });

  it('maps an outer abort to cancelled', async () => {
    const ac = new AbortController();
    const p = createApiClient({ baseUrl: BASE, fetch: hangingFetch, timeoutMs: 5000 }).get('/x', Obj, ac.signal);
    setTimeout(() => ac.abort(), 10);
    const e = await fail(p);
    expect(e.kind).toBe('cancelled');
    expect(e.message).toBe('cancelled');
  });

  it('does not call fetch when the outer signal is already aborted', async () => {
    const { fetch, calls } = fakeFetch({ 'GET /x': { body: { a: 1 } } });
    const ac = new AbortController();
    ac.abort();
    const e = await fail(createApiClient({ baseUrl: BASE, fetch }).get('/x', Obj, ac.signal));
    expect(e.kind).toBe('cancelled');
    expect(calls).toHaveLength(0);
  });

  it('turns a schema mismatch into bad_response', async () => {
    const { fetch } = fakeFetch({ 'GET /x': { body: { a: 'not a number' } } });
    const e = await fail(createApiClient({ baseUrl: BASE, fetch }).get('/x', Obj));
    expect(e.kind).toBe('bad_response');
    expect(e.message).toContain('schemas.ts');
  });

  it('turns a non-JSON 200 into bad_response', async () => {
    const { fetch } = fakeFetch({ 'GET /x': { raw: '<html>' } });
    const e = await fail(createApiClient({ baseUrl: BASE, fetch }).get('/x', Obj));
    expect(e.kind).toBe('bad_response');
  });
});

describe('idPath', () => {
  it('builds a path from a uuid with prefix and suffix', () => {
    expect(idPath('/repos', REPO_ID, '/pulls')).toBe(`/repos/${REPO_ID}/pulls`);
  });
  it('refuses anything that is not a uuid (no traversal or injection)', () => {
    for (const bad of ['../etc', 'abc', `${REPO_ID}/../x`, `${REPO_ID}?x=1`, '']) {
      expect(() => idPath('/repos', bad)).toThrow(ApiError);
    }
  });
});
