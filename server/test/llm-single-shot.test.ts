/**
 * SPEC-02 AC5 "exactly one request": container.llmSingleShot builds each provider with
 * transport retries off; adapters then make exactly one attempt on a retryable error.
 * Adapter-boundary mocks only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

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
import { MockSecretsProvider, MockLLMProvider } from '../src/adapters/mocks.js';
import { OpenAIProvider } from '../src/adapters/llm/openai.js';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const secrets = () =>
  new MockSecretsProvider({ OPENAI_API_KEY: 'k1', ANTHROPIC_API_KEY: 'k2', OPENROUTER_API_KEY: 'k3' });
const container = (overrides = {}) =>
  new Container(config(), {} as never, { secrets: secrets(), ...overrides });

beforeEach(() => orCtor.mockClear());

describe('container.llmSingleShot', () => {
  it('returns an injected override', async () => {
    const mock = new MockLLMProvider();
    const c = container({ llm: { openrouter: mock } });
    expect(await c.llmSingleShot('openrouter')).toBe(mock);
  });

  it('openrouter: retries off and 90 s timeout; default llm() leaves retries unset', async () => {
    const c = container();
    await c.llmSingleShot('openrouter');
    const opts = orCtor.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts.maxRetries).toBe(0);
    expect(opts.timeoutMs).toBe(90_000);
    expect(typeof opts.estimateCost).toBe('function');

    orCtor.mockClear();
    await c.llm('openrouter');
    const def = orCtor.mock.calls[0]![1] as Record<string, unknown>;
    expect(def.maxRetries).toBeUndefined();
  });

  it('openai and anthropic: built with transportRetries 0 (defaults keep it unset)', async () => {
    const c = container();
    const oa = (await c.llmSingleShot('openai')) as unknown as { transportRetries?: number };
    const an = (await c.llmSingleShot('anthropic')) as unknown as { transportRetries?: number };
    expect(oa).toBeInstanceOf(OpenAIProvider);
    expect(an).toBeInstanceOf(AnthropicProvider);
    expect(oa.transportRetries).toBe(0);
    expect(an.transportRetries).toBe(0);
    const defOa = (await c.llm('openai')) as unknown as { transportRetries?: number };
    expect(defOa.transportRetries).toBeUndefined();
  });

  it('is uncached: two calls give distinct instances', async () => {
    const c = container();
    expect(await c.llmSingleShot('openai')).not.toBe(await c.llmSingleShot('openai'));
  });
});

const retryable = Object.assign(new Error('boom'), { status: 500 });
const schema = z.object({ a: z.string() });
const req = { model: 'm', schema, schemaName: 'S', messages: [{ role: 'user' as const, content: 'x' }] };

describe('adapters make exactly one request with transportRetries 0', () => {
  it('OpenAIProvider: one attempt on a retryable error', async () => {
    const p = new OpenAIProvider('k', { transportRetries: 0 });
    const create = vi.fn().mockRejectedValue(retryable);
    (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    await expect(p.completeStructured(req)).rejects.toThrow('boom');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('AnthropicProvider: one attempt on a retryable error', async () => {
    const p = new AnthropicProvider('k', { transportRetries: 0 });
    const create = vi.fn().mockRejectedValue(retryable);
    (p as unknown as { client: unknown }).client = { messages: { create } };
    await expect(p.completeStructured(req)).rejects.toThrow('boom');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('control: the default OpenAIProvider retries the same error (so the test can fail)', async () => {
    const p = new OpenAIProvider('k');
    const create = vi.fn().mockRejectedValue(retryable);
    (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    await expect(p.completeStructured(req)).rejects.toThrow('boom');
    expect(create.mock.calls.length).toBeGreaterThan(1);
  }, 20_000);
});
