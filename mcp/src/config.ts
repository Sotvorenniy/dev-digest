import { DEFAULT_API } from './constants.js';

export interface Config {
  baseUrl: string;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Reads DEVDIGEST_API. Only http(s) is accepted; a non-loopback host warns once. */
export function loadConfig(
  env: Record<string, string | undefined>,
  warn: (message: string) => void = () => {},
): Config {
  const raw = env.DEVDIGEST_API?.trim();
  const value = raw ? raw : DEFAULT_API;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`DEVDIGEST_API is not a valid URL; set it to e.g. ${DEFAULT_API}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`DEVDIGEST_API must use http: or https:; set it to e.g. ${DEFAULT_API}`);
  }
  if (url.username || url.password) {
    throw new Error(`DEVDIGEST_API must not contain credentials; remove the user:password@ part and set it to e.g. ${DEFAULT_API}`);
  }
  if (url.search || url.hash) {
    throw new Error(`DEVDIGEST_API must not contain a query or fragment; set it to e.g. ${DEFAULT_API}`);
  }
  if (!LOOPBACK.has(url.hostname)) {
    warn(`DEVDIGEST_API points at non-loopback host ${url.hostname}; requests are unauthenticated`);
  }
  return { baseUrl: `${url.origin}${url.pathname}`.replace(/\/+$/, '') };
}
