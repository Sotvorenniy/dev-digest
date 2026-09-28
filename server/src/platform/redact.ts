/**
 * Scrub credentials out of text that is about to be persisted or logged.
 *
 * Job failures are written verbatim into `jobs.error` and errors flow into the
 * Pino stream, so any secret that reaches an error message reaches durable
 * storage. Git is the realistic source: a credentialed remote (`https://user:pat@host`)
 * or an auth header passed as a config argument. Today neither should occur —
 * the GitClient keeps the PAT out of both the remote and, as verified, out of
 * simple-git's error text — but "should not occur" is a weak guarantee for a
 * secret at rest, and this costs one function call.
 */

const PATTERNS: [RegExp, string][] = [
  // https://user:secret@host  →  https://***@host
  [/\b(https?:\/\/)[^/\s@]+@/gi, '$1***@'],
  // -c http.extraHeader=Authorization: Basic <base64>
  [/(authorization:\s*(?:basic|bearer)\s+)[\w+/=._-]+/gi, '$1***'],
  // Bare provider tokens that occasionally appear in upstream error bodies.
  [/\b(gh[pousr]_)[A-Za-z0-9]{16,}/g, '$1***'],
  [/\b(sk-(?:proj-|ant-)?)[A-Za-z0-9_-]{16,}/g, '$1***'],
];

/** Replace anything that looks like a credential with a marker. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}
