import type { CiFile, CiInstallation } from '@devdigest/shared';
import { AppError, ValidationError } from '../../platform/errors.js';
import {
  CI_PATHS,
  SAFE_PATH_ROOTS,
  SLUG_RE,
  type CiPostAs,
  type CiTrigger,
} from './constants.js';
import { renderManifest } from './manifest.js';
import type { CiAgent, CiInstallationRecord } from './ports.js';
import { renderWorkflow } from './workflow.js';

/**
 * CI export domain rules — pure functions, no I/O, no runtime zod.
 */

// ---- Domain errors ---------------------------------------------------------

export class CiRepoHasOtherAgentError extends AppError {
  constructor(agentName: string) {
    super(
      'ci_repo_has_other_agent',
      `This repo already has CI installed for agent "${agentName}"`,
      409,
      { agent_name: agentName },
    );
  }
}

export class CiProviderUnsupportedError extends AppError {
  constructor(message = 'CI export supports only agents that use the OpenRouter provider') {
    super('ci_provider_unsupported', message, 422);
  }
}

export class CiRateLimitedError extends AppError {
  constructor(message = 'GitHub rate limit reached; try again later') {
    super('rate_limited', message, 429);
  }
}

// ---- Slugs and paths -------------------------------------------------------

/** Lowercase, non-alphanumeric runs become `-`, edge dashes trimmed. No `/` splitting. */
export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function requireSlug(text: string, what: string): string {
  const slug = toSlug(text);
  if (!SLUG_RE.test(slug)) {
    throw new ValidationError(`The ${what} name "${text}" cannot be turned into a file name`);
  }
  return slug;
}

/** Skill file slugs in order; two skills mapping to one slug is a 422 naming both. */
export function skillSlugs(skills: { name: string }[]): string[] {
  const seen = new Map<string, string>();
  return skills.map((skill) => {
    const slug = requireSlug(skill.name, 'skill');
    const other = seen.get(slug);
    if (other !== undefined) {
      throw new ValidationError(
        `Skills "${other}" and "${skill.name}" would both be written to ${slug}.md`,
      );
    }
    seen.set(slug, skill.name);
    return slug;
  });
}

/** Every generated path stays under the allowed roots (NFR4). */
export function assertSafePath(path: string): void {
  const underRoot = SAFE_PATH_ROOTS.some((root) => path.startsWith(root));
  if (!underRoot || path.startsWith('/') || path.split('/').includes('..')) {
    throw new ValidationError(`Refusing to write outside the CI directories: ${path}`);
  }
}

// ---- File set --------------------------------------------------------------

/** Order: manifest, skills, runner, workflow. */
export function buildCiFiles(input: {
  agent: CiAgent;
  bundle: string;
  triggers: CiTrigger[];
  postAs: CiPostAs;
}): CiFile[] {
  const { agent, bundle, triggers, postAs } = input;
  const agentSlug = requireSlug(agent.name, 'agent');
  const slugs = skillSlugs(agent.skills);
  const files: CiFile[] = [
    {
      path: `${CI_PATHS.agentsDir}${agentSlug}.yaml`,
      contents: renderManifest(agent, slugs),
      editable: false,
    },
    ...agent.skills.map((skill, i) => ({
      path: `${CI_PATHS.skillsDir}${slugs[i]!}.md`,
      contents: skill.body,
      editable: false,
    })),
    { path: CI_PATHS.runner, contents: bundle, editable: false },
    {
      path: CI_PATHS.workflow,
      contents: renderWorkflow({ triggers, postAs }),
      editable: false,
    },
  ];
  for (const file of files) assertSafePath(file.path);
  return files;
}

// ---- Wire mapping ----------------------------------------------------------

export function toWireInstallation(record: CiInstallationRecord): CiInstallation {
  return {
    id: record.id,
    agent_id: record.agentId,
    repo: record.repo,
    target_type: record.targetType,
    installed_at: record.installedAt.toISOString(),
    pr_url: record.prUrl,
  };
}
