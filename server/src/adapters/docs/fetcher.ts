import { DOC_MAX_BYTES, isDocUrlAllowed } from '../../ports/doc-fetcher.js';
import type { DocFetcher, DocFetchResult } from '../../ports/doc-fetcher.js';

const FETCH_TIMEOUT_MS = 8_000;

/**
 * Allowlist-only HTTP fetcher for plan/spec documents. Defence in depth against
 * SSRF: re-checks the allowlist, refuses redirects (a redirect could leave the
 * allowlist), bounds time and body size, and never puts the URL (which may carry
 * a query) into an error message.
 */
export class HttpDocFetcher implements DocFetcher {
  async fetch(url: string): Promise<DocFetchResult> {
    if (!isDocUrlAllowed(url)) throw new Error('document host is not allowed');
    const res = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'text/plain, text/markdown;q=0.9, */*;q=0.1' },
    });
    if (!res.ok) throw new Error(`document fetch failed with status ${res.status}`);

    const reader = res.body?.getReader();
    if (!reader) return { content: '', truncated: false };
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > DOC_MAX_BYTES) {
        chunks.push(value.subarray(0, DOC_MAX_BYTES - total));
        total = DOC_MAX_BYTES;
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
    return { content: Buffer.concat(chunks).toString('utf8'), truncated };
  }
}
