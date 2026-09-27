/**
 * What did a run cost? — the single answer, so the read-time fallback and the
 * "—" rule can't drift between the PR list, the run timeline and the trace.
 *
 * Cost is persisted on `agent_runs.cost_usd` at completion, but runs that
 * predate migration 0010 kept their token counts while losing the column, so a
 * price can still be derived for them on read. The estimator is always the
 * container's `PriceBook.estimate` (live OpenRouter prices, static table as
 * fallback) — synchronous by design, hence safe inside a row mapper.
 */

export type CostEstimator = (model: string, tokensIn: number, tokensOut: number) => number | null;

export interface RunCostInput {
  costUsd: number | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

/**
 * Persisted cost, else tokens x price. Null — rendered "—" — when we genuinely
 * don't know: no model, no token counts, or an unpriced slug. A run with zero
 * tokens never reached the model (failed / cancelled), so it is unknown rather
 * than free: null, never 0.
 */
export function resolveRunCost(estimate: CostEstimator, run: RunCostInput): number | null {
  if (run.costUsd != null) return run.costUsd;
  if (!run.model || run.tokensIn == null || run.tokensOut == null) return null;
  if (run.tokensIn === 0 && run.tokensOut === 0) return null;
  return estimate(run.model, run.tokensIn, run.tokensOut);
}

/**
 * Total for a PR. Unpriceable runs are skipped rather than poisoning the sum —
 * a PR that spent $0.014 on two of three runs should say $0.014, not "—".
 * Null only when not a single run could be priced.
 */
export function sumRunCosts(estimate: CostEstimator, runs: RunCostInput[]): number | null {
  let total: number | null = null;
  for (const run of runs) {
    const cost = resolveRunCost(estimate, run);
    if (cost == null) continue;
    total = (total ?? 0) + cost;
  }
  return total;
}
