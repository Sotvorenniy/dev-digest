/** Shown wherever a cost or a token count is genuinely unknown. Never "$0.00". */
export const UNKNOWN = "—";

/** Below this, 4dp would round a real cost to "$0.00". */
const SMALLEST_SHOWN = 0.0001;

/**
 * USD for a run, or "—" when we don't know it.
 *
 * Review costs span six orders of magnitude — a cheap OpenRouter model can run
 * a PR for $0.00003 while a large map-reduce run costs $1.20 — so a fixed
 * precision is wrong at one end or the other: `toFixed(2)` flattens $0.0013 to
 * "$0.00", `toFixed(4)` renders "$0.0600". Formatting at 4 dp and then trimming
 * trailing zeros to a 2 dp floor keeps small runs readable and large ones tidy.
 *
 * Two exact values carry meaning and must stay distinguishable:
 *   $0.00      — genuinely free (OpenRouter has ~22 models priced 0/0)
 *   <$0.0001   — real spend, too small for 4 dp
 * Rounding the second into the first would report a paid run as free, which is
 * the same lie as showing "$0.00" for a run whose price we don't know.
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return UNKNOWN;
  if (usd > 0 && usd < SMALLEST_SHOWN) return `<$${SMALLEST_SHOWN}`;
  const fixed = usd.toFixed(4);
  const trimmed = fixed.replace(/(\.\d{2}\d*?)0+$/, "$1");
  return `$${trimmed}`;
}

/** Thin space, so "9 119" groups without looking like two numbers. */
const GROUP_SEPARATOR = " ";

/**
 * Total tokens a run consumed, grouped — 9119 → "9 119". Null when the run
 * never reported usage, which is also how a run that never reached the model
 * (failed, cancelled) shows up.
 */
export function formatTokensTotal(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  if (tokensIn == null && tokensOut == null) return null;
  const total = (tokensIn ?? 0) + (tokensOut ?? 0);
  if (total <= 0) return null;
  return String(total).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}
