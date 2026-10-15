import pRetry from 'p-retry';

/**
 * resilience primitives: timeouts on every external call + retry with
 * exponential backoff on transient failures (rate-limit / 5xx).
 */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (!ms || ms <= 0) return p;
  let handle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(handle!);
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Decide whether an error is retryable (rate-limit / 5xx / network by default). */
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (attempt: number, err: unknown) => void;
}

/** Process-wide defaults, set once at boot from AppConfig. */
const defaults = { retries: 5, maxDelayMs: 30_000 };

export function configureRetryDefaults(opts: { retries: number; maxDelayMs: number }): void {
  defaults.retries = opts.retries;
  defaults.maxDelayMs = opts.maxDelayMs;
}

function defaultIsRetryable(err: unknown): boolean {
  const status =
    (err as { status?: number })?.status ??
    (err as { statusCode?: number })?.statusCode ??
    (err as { response?: { status?: number } })?.response?.status;
  if (typeof status === 'number') return status === 408 || status === 429 || status >= 500;
  // No HTTP status: treat as a transient network failure and retry.
  return true;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;
  return pRetry(fn, {
    retries: opts.retries ?? defaults.retries,
    minTimeout: opts.baseDelayMs ?? 250,
    maxTimeout: opts.maxDelayMs ?? defaults.maxDelayMs,
    randomize: true,
    shouldRetry: (err) => isRetryable(err),
    onFailedAttempt: (err) => {
      if (isRetryable(err)) opts.onRetry?.(err.attemptNumber, err);
    },
  });
}
