import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillsRepositoryPort } from './ports.js';
import { FETCH_URL_MAX_BYTES, FETCH_URL_TIMEOUT_MS } from './constants.js';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';

/**
 * A1 — skills service. Business logic for the Skills library (rubric /
 * convention / security / custom skills that agents can be given).
 *
 * A Skill = name + description + type + body + enabled. Body-affecting changes
 * are versioned via `skill_versions` (repository) — same idiom as agents.
 */

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  change_note?: string;
}

export interface SkillsServiceDeps {
  repo: SkillsRepositoryPort;
}

export class SkillsService {
  private repo: SkillsRepositoryPort;

  constructor(deps: SkillsServiceDeps) {
    this.repo = deps.repo;
  }

  list(workspaceId: string): Promise<Skill[]> {
    return this.repo.list(workspaceId);
  }

  get(workspaceId: string, id: string): Promise<Skill | undefined> {
    return this.repo.getById(workspaceId, id);
  }

  /** Delete a skill (and its versions/agent-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const source = input.source ?? 'manual';
    return this.repo.insert({
      workspaceId,
      name: input.name,
      type: input.type,
      body: input.body,
      source,
      ...(input.description !== undefined ? { description: input.description } : {}),
      // A non-manual skill (imported/extracted/community) is never auto-enabled,
      // regardless of what the client sent for `enabled`.
      enabled: source === 'manual' ? (input.enabled ?? true) : false,
    });
  }

  update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    return this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.change_note !== undefined ? { changeNote: patch.change_note } : {}),
    });
  }

  /**
   * Body history for a skill, newest version first. Workspace-scoped: returns
   * undefined when the skill isn't in this workspace (the route maps that to
   * 404) so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.listVersions(id);
  }

  /**
   * Restore an older version's body as current. Workspace-scoped: undefined
   * when the skill isn't in this workspace OR that version was never recorded
   * (route → 404).
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.restoreVersion(id, version);
  }

  /**
   * Preview a skill body fetched from a URL — never persists anything; the
   * client calls `POST /skills` afterward (with `source: 'imported_url'`) to
   * actually save it. The response is treated strictly as opaque text data,
   * never executed or interpreted, and is bounded by a timeout and a size cap.
   */
  async fetchUrlPreview(url: string): Promise<{ name: string; body: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_URL_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch {
      throw new ExternalServiceError('Failed to fetch URL (timeout or network error)');
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      throw new ExternalServiceError(`Failed to fetch URL (status ${res.status})`);
    }

    const contentLength = res.headers.get('content-length');
    if (contentLength && Number(contentLength) > FETCH_URL_MAX_BYTES) {
      throw new ValidationError('URL content exceeds the size limit');
    }

    const contentType = res.headers.get('content-type');
    if (contentType && !contentType.includes('text') && !contentType.includes('markdown')) {
      throw new ValidationError(`Unsupported content type: ${contentType}`);
    }

    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > FETCH_URL_MAX_BYTES) {
      throw new ValidationError('URL content exceeds the size limit');
    }

    const headingLine = text.split('\n').find((line) => /^#\s+(.+)$/.test(line));
    const name = headingLine
      ? headingLine.replace(/^#\s+/, '').trim()
      : (url.split('/').filter(Boolean).pop() ?? url).replace(/\.[^./]+$/, '');

    return { name, body: text };
  }
}
