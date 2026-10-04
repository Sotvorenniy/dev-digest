/**
 * DocFetcher port — fetches a plan/spec document by URL for the intent layer.
 *
 * Deliberately narrow: only an allowlisted set of GitHub raw-content hosts may be
 * fetched. Every other host is "listed, not fetched" by the caller. The allowlist
 * lives here (core) so the domain classifier and the adapter agree on it.
 */

/** Exact hostnames a DocFetcher may contact. Anything else is never requested. */
export const DOC_FETCH_HOSTS: readonly string[] = [
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
];

/** Largest document body accepted, in bytes. */
export const DOC_MAX_BYTES = 100_000;

/** True when `raw` is an https URL on an allowlisted host (no credentials, default port). */
export function isDocUrlAllowed(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return (
    u.protocol === 'https:' &&
    u.username === '' &&
    u.password === '' &&
    u.port === '' &&
    DOC_FETCH_HOSTS.includes(u.hostname.toLowerCase())
  );
}

export interface DocFetchResult {
  content: string;
  /** True when the body exceeded `DOC_MAX_BYTES` and was cut. */
  truncated: boolean;
}

export interface DocFetcher {
  /** Rejects when the URL is not allowlisted, redirects, times out or fails. */
  fetch(url: string): Promise<DocFetchResult>;
}
