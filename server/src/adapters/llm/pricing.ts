/**
 * cost discipline — per-provider/model pricing table (USD per 1M tokens).
 * Unknown models return null cost (explicitly flagged), per spec.
 *
 * This table is a hand-maintained SNAPSHOT and the LAST resort. Cost is
 * resolved in descending order of truth:
 *   1. `usage.cost` returned by OpenRouter — what was actually charged.
 *   2. `PriceBook` — live prices from OpenRouter `/models`, refreshed on a TTL.
 *   3. this table — for OpenAI/Anthropic (whose APIs don't return prices) and
 *      for a cold/failed PriceBook cache.
 * A wrong number here is worse than no number, because the UI renders it as
 * fact. When in doubt, DELETE the row: an absent slug yields null, which the
 * RunCostBadge renders as "—".
 *
 * OpenRouter rows verified against openrouter.ai/api/v1/models on 2026-09-25.
 * Anthropic rows per the Anthropic pricing table (2026-06-24 snapshot).
 */
interface Price {
  in: number;
  out: number;
}

const PRICING: Record<string, Price> = {
  // OpenAI (approximate public list prices, USD / 1M tokens)
  'gpt-5.5': { in: 5.0, out: 30.0 },
  'gpt-5.4': { in: 2.5, out: 15.0 },
  'gpt-5.4-mini': { in: 0.75, out: 4.5 },
  'gpt-5.4-nano': { in: 0.2, out: 1.25 },
  'gpt-5.1': { in: 1.25, out: 10.0 },
  'gpt-5': { in: 1.25, out: 10.0 },
  'gpt-4.1': { in: 2.0, out: 8.0 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4o': { in: 2.5, out: 10.0 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'text-embedding-3-small': { in: 0.02, out: 0 },
  // Anthropic — current generation. Without these a run on the documented
  // default model prices to null and the badge reads "—".
  'claude-fable-5-1': { in: 10.0, out: 50.0 },
  'claude-opus-5-5': { in: 4.0, out: 20.0 },
  'claude-opus-5': { in: 5.0, out: 25.0 },
  'claude-opus-4-8': { in: 5.0, out: 25.0 },
  'claude-sonnet-5': { in: 2.0, out: 10.0 },
  'claude-sonnet-4-6': { in: 3.0, out: 15.0 },
  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
  // Anthropic — legacy `-latest` aliases.
  'claude-3-5-sonnet-latest': { in: 3.0, out: 15.0 },
  'claude-3-5-haiku-latest': { in: 0.8, out: 4.0 },
  'claude-3-opus-latest': { in: 15.0, out: 75.0 },
  // OpenRouter (CI runner, cheap models). Prices below are the REAL list
  // prices read from openrouter.ai/api/v1/models on 2026-09-25 — they drift,
  // and the live PriceBook supersedes them whenever its cache is warm.
  // `z-ai/glm-4.7-flashx` is deliberately absent: no such slug exists on
  // OpenRouter, so it must fall through to null rather than invent a price.
  'z-ai/glm-4.7-flash': { in: 0.0605, out: 0.4 },
  'deepseek/deepseek-v4-flash': { in: 0.0476, out: 0.0952 },
  'minimax/minimax-m2.5': { in: 0.27, out: 1.08 },
  'z-ai/glm-5.1': { in: 0.9646, out: 3.0316 },
};

export function estimateCost(model: string, tokensIn: number, tokensOut: number): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}
