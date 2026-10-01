/** Rough token-count heuristic for a body of text — no exact tokenizer on the
 *  client, so this is an estimate only (~4 chars/token), matching the bare
 *  count (no budget/denominator) shown for a skill's body. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
