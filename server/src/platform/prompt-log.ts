import { createHash } from 'node:crypto';
import type { PromptAssembly } from '@devdigest/shared';
import { estimateSkillsTokens } from './trace-builder.js';

/**
 * Metadata-only summary of an assembled prompt, for structured logs.
 *
 * Pure: no IO, no Container. It reads section TEXT only to measure it (length,
 * line count, sha256 prefix) and NEVER returns, previews or slices that text.
 * The `user` section embeds the PR diff, so it is reported as one opaque
 * section with the diff size alongside; its content is never touched beyond
 * measuring.
 */

export type PromptSectionName =
  | 'system'
  | 'skills'
  | 'memory'
  | 'specs'
  | 'callers'
  | 'repo_map'
  | 'pr_description'
  | 'intent'
  | 'user';

/** Fixed label per section describing where its content comes from. */
export const PROMPT_SECTION_SOURCES: Record<PromptSectionName, string> = {
  system: 'agent_config',
  skills: 'agent_skills',
  memory: 'repo_memory',
  specs: 'project_specs',
  callers: 'repo_intel',
  repo_map: 'repo_intel',
  pr_description: 'github_pr',
  intent: 'intent_layer',
  user: 'pr_diff+task',
};

/** Prompt order, as assembled by reviewer-core. */
const ORDER: PromptSectionName[] = [
  'system',
  'skills',
  'memory',
  'specs',
  'callers',
  'repo_map',
  'pr_description',
  'intent',
  'user',
];

export interface PromptSectionSummary {
  section: PromptSectionName;
  source: string;
  chars: number;
  tokens_est: number;
  /** Verbose mode only. */
  lines?: number;
  /** Verbose mode only: first 12 hex of sha256 of the section text. */
  sha256_12?: string;
  /** Verbose mode only: position in the prompt (0-based, present sections only). */
  order?: number;
}

export interface PromptAssemblySummary {
  sections: PromptSectionSummary[];
  total_chars: number;
  total_tokens_est: number;
  /** Size of the diff embedded in `user` (counts only). */
  diff?: { chars: number; files: number };
  /** Verbose mode only. */
  skills_used?: string[];
  /** Verbose mode only: estimated tokens per skill name (when known). */
  skill_tokens?: Record<string, number>;
}

export interface SummarizeExtra {
  diffChars?: number;
  diffFiles?: number;
  /** Names the user already sees in the agent editor. */
  skillsUsed?: string[];
  /** Per-skill rendered text, only to be measured (never emitted). */
  skillTexts?: { name: string; text: string }[];
  verbose?: boolean;
}

const estTokens = (text: string): number => estimateSkillsTokens(text) ?? 0;

export function summarizePromptAssembly(
  assembly: PromptAssembly,
  extra: SummarizeExtra = {},
): PromptAssemblySummary {
  const sections: PromptSectionSummary[] = [];
  for (const name of ORDER) {
    const text = assembly[name];
    if (typeof text !== 'string' || text.length === 0) continue;
    const item: PromptSectionSummary = {
      section: name,
      source: PROMPT_SECTION_SOURCES[name],
      chars: text.length,
      tokens_est: estTokens(text),
    };
    if (extra.verbose) {
      item.lines = text.split('\n').length;
      item.sha256_12 = createHash('sha256').update(text).digest('hex').slice(0, 12);
      item.order = sections.length;
    }
    sections.push(item);
  }

  const out: PromptAssemblySummary = {
    sections,
    total_chars: sections.reduce((n, s) => n + s.chars, 0),
    total_tokens_est: sections.reduce((n, s) => n + s.tokens_est, 0),
  };
  if (extra.diffChars !== undefined && extra.diffFiles !== undefined) {
    out.diff = { chars: extra.diffChars, files: extra.diffFiles };
  }
  if (extra.verbose) {
    if (extra.skillsUsed) out.skills_used = extra.skillsUsed;
    if (extra.skillTexts?.length) {
      out.skill_tokens = Object.fromEntries(extra.skillTexts.map((s) => [s.name, estTokens(s.text)]));
    }
  }
  return out;
}
