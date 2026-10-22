/** `ApiError.code` values the Run-all button explains; anything else is `generic`. */
export const START_ERROR_CODES = ["eval_run_active", "no_eval_cases", "provider_not_configured", "rate_limited"] as const;
export type StartErrorKey = (typeof START_ERROR_CODES)[number] | "generic";

/** Where `provider_not_configured` sends the user (Settings → API Keys). */
export const API_KEYS_HREF = "/settings/api-keys";

export const METRIC_KEYS = ["recall", "precision", "citation", "passed"] as const;
