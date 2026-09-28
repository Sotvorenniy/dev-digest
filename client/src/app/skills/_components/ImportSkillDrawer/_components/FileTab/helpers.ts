import JSZip from "jszip";

export interface ZipCandidate {
  path: string;
  text: string;
}

const TEXT_ENTRY_RE = /\.(md|markdown|txt)$/i;

/** Extract only markdown/text entries from a .zip. Every other entry's bytes
 *  are left untouched — never read, never executed. */
export async function extractZipCandidates(file: File): Promise<ZipCandidate[]> {
  const zip = await JSZip.loadAsync(file);
  const out: ZipCandidate[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !TEXT_ENTRY_RE.test(entry.name)) continue;
    out.push({ path: entry.name, text: await entry.async("text") });
  }
  return out;
}

/** Derive a skill name from the body's first `#` heading (kebab-cased),
 *  or null when the body has none — the caller falls back to a default. */
export function deriveNameFromBody(body: string): string | null {
  const m = body.match(/^#\s+(.+)$/m);
  if (!m) return null;
  return m[1]!
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
