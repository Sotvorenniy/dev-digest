/**
 * SPEC-03 F4: the brief service built by the Container uses the single-shot provider path
 * (transport retries off, 90 s timeout) and is one memoized instance. Adapter-boundary mocks only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const orCtor = vi.fn();
vi.mock('@devdigest/reviewer-core', async (orig) => {
  const actual = await orig<typeof import('@devdigest/reviewer-core')>();
  class FakeOpenRouter {
    id = 'openrouter' as const;
    constructor(key: string, opts: unknown) {
      orCtor(key, opts);
    }
  }
  return { ...actual, OpenRouterProvider: FakeOpenRouter };
});

import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { MockSecretsProvider } from '../src/adapters/mocks.js';
import type { BriefServiceDeps } from '../src/modules/brief/service.js';

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const container = () =>
  new Container(config(), {} as never, {
    secrets: new MockSecretsProvider({ OPENAI_API_KEY: 'k1', ANTHROPIC_API_KEY: 'k2', OPENROUTER_API_KEY: 'k3' }),
  });
const depsOf = (c: Container) => (c.briefService as unknown as { deps: BriefServiceDeps }).deps;

beforeEach(() => orCtor.mockClear());

describe('container.briefService wiring', () => {
  it('openrouter goes through llmSingleShot (not llm) with maxRetries 0 and a 90 s timeout', async () => {
    const c = container();
    const single = vi.spyOn(c, 'llmSingleShot');
    const plain = vi.spyOn(c, 'llm');
    await depsOf(c).llm('openrouter');
    expect(single).toHaveBeenCalledTimes(1);
    expect(single).toHaveBeenCalledWith('openrouter');
    expect(plain).not.toHaveBeenCalled();
    const opts = orCtor.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts.maxRetries).toBe(0);
    expect(opts.timeoutMs).toBe(90_000);
  });

  it('openai is built with transportRetries 0', async () => {
    const c = container();
    const p = (await depsOf(c).llm('openai')) as unknown as { transportRetries?: number };
    expect(p.transportRetries).toBe(0);
  });

  it('is memoized, so overlapping requests share one in-flight map', () => {
    const c = container();
    expect(c.briefService).toBe(c.briefService);
  });
});
