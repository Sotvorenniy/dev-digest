import type { ConventionCandidate } from "@devdigest/shared";
import { formatEvidenceLocation } from "../ConventionCandidateCard/helpers";

/** Plain text → a filesystem/heading-safe slug: lowercase, non-alphanumeric
 *  runs collapsed to a single "-", leading/trailing "-" trimmed. Falls back to
 *  `fallback` if nothing alphanumeric survives (e.g. an all-symbol string). */
function slugify(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

/** repo `full_name` or plain name → its slug, e.g. "acme/widgets" → "widgets",
 *  "My Repo" → "my-repo" — only the last "/"-segment is slugified, so an
 *  org/repo full_name doesn't turn into "acme-widgets". */
function slugifyRepoName(name: string): string {
  const base = name.includes("/") ? (name.split("/").pop() ?? name) : name;
  return slugify(base, "repo");
}

/** Default skill name prefill. */
export const DEFAULT_SKILL_NAME = "repo-conventions";

export function buildDefaultSkillName(): string {
  return DEFAULT_SKILL_NAME;
}

/** Builds the editable markdown body prefill for the Create-skill modal — one
 *  `##` section per accepted candidate, each with its rule, evidence location
 *  and snippet. Fully editable afterward; this is only the starting point. */
export function buildDefaultSkillBody(acceptedCandidates: ConventionCandidate[], repoName: string): string {
  const sections = acceptedCandidates.map((c) => {
    const heading = slugify(c.rule, "convention");
    return [
      `## ${heading}`,
      c.rule,
      "",
      `Detected in \`${formatEvidenceLocation(c)}\`:`,
      "",
      "```",
      c.evidence_snippet,
      "```",
    ].join("\n");
  });
  return [`# ${slugifyRepoName(repoName)}-conventions`, "", ...sections].join("\n");
}
