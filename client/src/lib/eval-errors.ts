/* Start-error mapping for "Run eval", shared by the Evals tab and the per-agent
   Eval Dashboard so both show identical `eval.evalsTab.errors.*` messages. */
import { ApiError } from "./api";

/** `ApiError.code` values the run button explains; anything else is `generic`. */
export const START_ERROR_CODES = ["eval_run_active", "no_eval_cases", "provider_not_configured", "rate_limited"] as const;
export type StartErrorKey = (typeof START_ERROR_CODES)[number] | "generic";

/** Where `provider_not_configured` sends the user (Settings → API Keys). */
export const API_KEYS_HREF = "/settings/api-keys";

/** Maps a failed start request to an `evalsTab.errors.*` key. 429 is `rate_limited`. */
export function startErrorKey(err: unknown): StartErrorKey {
  if (!(err instanceof ApiError)) return "generic";
  if (err.status === 429) return "rate_limited";
  const known = START_ERROR_CODES.find((c) => c === err.code);
  return known ?? "generic";
}
