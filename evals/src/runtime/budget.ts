/**
 * Hard token budget for one eval process. Every model call goes through run-claude or
 * run-openrouter; both check the budget before a call and charge it after. Once the running
 * total passes EVAL_TOKEN_BUDGET the next call throws, so a runaway matrix leg stops spending
 * instead of only warning in the report. Unset (the default, e.g. locally) means no cap.
 */

const BUDGET = Number(process.env.EVAL_TOKEN_BUDGET ?? 0);
let spent = 0;

export function assertWithinBudget(): void {
  if (BUDGET > 0 && spent > BUDGET) {
    throw new Error(`eval token budget exhausted: ${spent} used, EVAL_TOKEN_BUDGET=${BUDGET}`);
  }
}

export function chargeBudget(tokens: number): void {
  spent += tokens;
}
