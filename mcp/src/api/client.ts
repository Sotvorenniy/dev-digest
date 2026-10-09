import type { ZodType } from 'zod';
import { REQUEST_TIMEOUT_MS, TEXT_CLIP } from '../constants.js';

export type ApiErrorKind =
  | 'unreachable'
  | 'timeout'
  | 'cancelled'
  | 'not_found'
  | 'invalid'
  | 'rate_limited'
  | 'client_error'
  | 'server_error'
  | 'bad_response';

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  get<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T>;
  post<T>(path: string, body: unknown, schema: ZodType<T>, signal?: AbortSignal): Promise<T>;
}

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;

  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    schema: ZodType<T>,
    outer?: AbortSignal,
  ): Promise<T> {
    if (outer?.aborted) throw new ApiError('cancelled', 'cancelled');
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = outer ? AbortSignal.any([timeout, outer]) : timeout;
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        signal,
        redirect: 'error',
        headers: body === undefined ? { accept: 'application/json' } : {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      if (outer?.aborted) throw new ApiError('cancelled', 'cancelled');
      if (timeout.aborted) {
        throw new ApiError('timeout', `API timed out after ${Math.round(timeoutMs / 1000)}s; retry`);
      }
      throw new ApiError(
        'unreachable',
        `devdigest API not reachable at ${base}; start the server (cd server && ./node_modules/.bin/tsx src/server.ts)`,
      );
    }

    if (!res.ok) throw await mapHttpError(res);

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiError('bad_response', 'API returned a non-JSON body; check the server version', res.status);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(
        'bad_response',
        'API response did not match the expected shape; the server contract may have changed (see mcp/src/api/schemas.ts); retry, and report this if it persists',
        res.status,
      );
    }
    return parsed.data;
  }

  return {
    get: (path, schema, signal) => request('GET', path, undefined, schema, signal),
    post: (path, body, schema, signal) => request('POST', path, body, schema, signal),
  };
}

async function envelopeMessage(res: Response): Promise<string | null> {
  try {
    const j = (await res.json()) as { error?: { message?: unknown } };
    const m = j?.error?.message;
    return typeof m === 'string' && m ? clip(m.replace(/\s+/g, ' '), TEXT_CLIP) : null;
  } catch {
    return null;
  }
}

async function mapHttpError(res: Response): Promise<ApiError> {
  const status = res.status;
  if (status >= 500) return new ApiError('server_error', `API error ${status}; check the server logs, then retry`, status);
  if (status === 429) {
    return new ApiError('rate_limited', 'rate limited by API (review: 10/min); wait ~60s, then retry', status);
  }
  if (status === 422) return new ApiError('invalid', 'invalid id or input; check repo, pr and run_id arguments', status);
  const msg = await envelopeMessage(res);
  if (status === 404) {
    return new ApiError(
      'not_found',
      `${msg ?? 'not found'}; check repo, pr and ids (list_agents shows agents)`,
      status,
    );
  }
  return new ApiError('client_error', `${msg ?? `API error ${status}`}; check the arguments and retry`, status);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Builds a path from a template and uuid segments; refuses anything that is not a uuid. */
export function idPath(prefix: string, id: string, suffix = ''): string {
  if (!UUID.test(id)) throw new ApiError('invalid', 'invalid id; check repo, pr and run_id arguments');
  return `${prefix}/${encodeURIComponent(id)}${suffix}`;
}
