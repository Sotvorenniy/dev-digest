import { describe, expect, it } from 'vitest';
import { createApiClient } from '../src/api/client.js';
import { ToolError } from '../src/errors.js';
import { resolveAgent, resolvePr, resolveRepo, validatePr, validateRepo } from '../src/resolve.js';
import { AGENT_ID, BASE, PR_ID, REPO_ID, fakeFetch, repoRoutes } from './helpers/fake-api.js';

const apiFor = (routes: Parameters<typeof fakeFetch>[0]) => {
  const f = fakeFetch(routes);
  return { api: createApiClient({ baseUrl: BASE, fetch: f.fetch }), calls: f.calls };
};

async function toolError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ToolError);
    return (e as Error).message;
  }
  throw new Error('expected ToolError');
}

describe('flat argument validation', () => {
  it('accepts owner/name and rejects packed or hostile strings with a fix hint', () => {
    expect(validateRepo('acme/api')).toBe('acme/api');
    for (const bad of ['acme', 'a/b/c', 'https://github.com/a/b', 'a b/c', 'a/b?x=1', '']) {
      expect(() => validateRepo(bad)).toThrow(/owner\/name.*fix the repo argument/);
    }
  });
  it('accepts 1-7 digit PR numbers only', () => {
    expect(validatePr(7)).toBe(7);
    expect(validatePr('1234567')).toBe(1234567);
    for (const bad of [0.5, -1, 12345678, 'abc', '1e3', '']) {
      expect(() => validatePr(bad)).toThrow(/fix the pr argument/);
    }
  });
});

describe('resolvePr / resolveRepo', () => {
  it('a null-id PR row does not break the list; the matching PR gets a next-step error', async () => {
    const routes = repoRoutes();
    routes[`GET /repos/${REPO_ID}/pulls`] = {
      body: [
        { id: null, number: 9, title: 'x', status: 'open' },
        { id: PR_ID, number: 7, title: 't', status: 'open' },
      ],
    };
    const { api } = apiFor(routes);
    expect(await resolvePr(api, 'acme/api', 7)).toEqual({ prId: PR_ID, repoId: REPO_ID });
    expect(await toolError(resolvePr(api, 'acme/api', 9))).toMatch(/not imported yet.*retry/);
  });

  it('resolves with exactly two calls (repos then pulls), case-insensitively', async () => {
    const { api, calls } = apiFor(repoRoutes());
    expect(await resolvePr(api, 'acme/api', 7)).toEqual({ prId: PR_ID, repoId: REPO_ID });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /repos', `GET /repos/${REPO_ID}/pulls`]);
  });

  it('unknown repo lists at most 10 imported names and says how to import', async () => {
    const repos = Array.from({ length: 15 }, (_, i) => ({ id: REPO_ID, full_name: `o/r${i}` }));
    const { api } = apiFor({ 'GET /repos': { body: repos } });
    const msg = await toolError(resolveRepo(api, 'x/y'));
    expect(msg).toContain('repo x/y not imported');
    expect(msg).toContain('o/r9');
    expect(msg).not.toContain('o/r10');
    expect(msg).toMatch(/Import it in DevDigest/);
  });

  it('unknown PR names the repo and points at gh pr list', async () => {
    const { api } = apiFor(repoRoutes());
    const msg = await toolError(resolvePr(api, 'acme/api', 999));
    expect(msg).toBe('PR #999 not found in Acme/Api; check the number (gh pr list)');
  });

  it('does not call the API when arguments are invalid', async () => {
    const { api, calls } = apiFor(repoRoutes());
    await toolError(resolvePr(api, 'bad', 7));
    await toolError(resolvePr(api, 'acme/api', 'x'));
    expect(calls).toHaveLength(0);
  });
});

describe('resolveAgent', () => {
  const agents = [
    { id: AGENT_ID, name: 'Security', enabled: true },
    { id: '77777777-7777-4777-8777-777777777777', name: 'Perf', enabled: true },
  ];
  it('matches by name case-insensitively', async () => {
    const { api } = apiFor({ 'GET /agents': { body: agents } });
    expect((await resolveAgent(api, 'sEcUrItY')).id).toBe(AGENT_ID);
  });
  it('matches by exact uuid', async () => {
    const { api } = apiFor({ 'GET /agents': { body: agents } });
    expect((await resolveAgent(api, AGENT_ID)).name).toBe('Security');
  });
  it('no match: points at list_agents and shows known names', async () => {
    const { api } = apiFor({ 'GET /agents': { body: agents } });
    const msg = await toolError(resolveAgent(api, 'nope'));
    expect(msg).toContain('call list_agents');
    expect(msg).toContain('Security, Perf');
  });
});
