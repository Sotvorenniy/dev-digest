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

const MAX_DESCRIPTION = 200;

/** Strip a leading `---` YAML frontmatter block, if present. */
function stripFrontmatter(body: string): string {
  const m = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? body.slice(m[0].length) : body;
}

/** First non-heading, non-fence paragraph of the body, whitespace-collapsed and
 *  truncated. Empty string when the body has no prose paragraph. */
export function deriveDescription(body: string): string {
  const paragraphs = stripFrontmatter(body).split(/\r?\n\s*\r?\n/);
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("```")) continue;
    const flat = trimmed.replace(/\s+/g, " ");
    return flat.length > MAX_DESCRIPTION ? `${flat.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : flat;
  }
  return "";
}

export interface ParsedSkill {
  name: string;
  description: string;
}

/** The skill "core" derived from a body: typed name wins, else the first
 *  heading, else a default. */
export function parseSkillCore(body: string, typedName: string): ParsedSkill {
  return {
    name: typedName.trim() || deriveNameFromBody(body) || "untitled-skill",
    description: deriveDescription(body),
  };
}
