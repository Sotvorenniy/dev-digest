/**
 * RootFiles port — a fixed allowlist of repo-root files (package.json, Makefile,
 * compose files, README) the onboarding tour reads as facts. Lockfiles and
 * `.env.example` are presence-only: their content is never opened.
 *
 * Names and limits live here (core) so the adapter and tests agree. No fs here.
 */
import type { RepoRef } from '@devdigest/shared';

/** Largest root file that is read, in bytes (same cap as a project-context doc). */
export const ROOT_FILE_MAX_BYTES = 65_536;

export const ROOT_PACKAGE_JSON = 'package.json';
export const ROOT_MAKEFILE = 'Makefile';
export const ROOT_COMPOSE_RE = /^(docker-)?compose(\.[\w-]+)?\.ya?ml$/i;
export const ROOT_README_RE = /^readme(\.md|\.markdown|\.txt)?$/i;
/** Presence-only (`stat`), never read. */
export const ROOT_LOCKFILES = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'bun.lockb',
  'bun.lock',
] as const;
export const ROOT_ENV_EXAMPLE = '.env.example';

export interface RootFilesSnapshot {
  packageJson: string | null;
  makefile: string | null;
  composeFiles: { name: string; text: string }[];
  readme: { name: string; text: string } | null;
  lockfiles: string[];
  hasEnvExample: boolean;
  skipped: { name: string; reason: 'too_large' | 'not_utf8' }[];
}

export interface RootFilesPort {
  /** Null when the clone root is unavailable. */
  read(repo: RepoRef): Promise<RootFilesSnapshot | null>;
}
