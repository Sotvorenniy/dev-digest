import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/** `/skills/:id/versions/:v/restore` — id is a uuid, v a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  v: z.coerce.number().int().positive(),
});

/**
 * A1 — skills module (owner A1). Owns `skills` + `skill_versions`; the
 * agent-side of the `agent_skills` link table belongs to A2's agents module.
 *   GET    /skills                          → list (workspace-scoped)
 *   GET    /skills/:id                      → one skill
 *   POST   /skills                          → create
 *   PUT    /skills/:id                       → update (body change bumps version)
 *   DELETE /skills/:id                       → delete (versions + agent links cascade)
 *   GET    /skills/:id/versions              → body history (newest first)
 *   POST   /skills/:id/versions/:v/restore   → restore an older version's body
 *   POST   /skills/fetch-url                 → preview a skill body fetched from a URL
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType,
  body: z.string().min(1),
  source: SkillSource.optional(),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  change_note: z.string().optional(),
});

const FetchUrlBody = z.object({ url: z.string().url() });

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.skillsService;

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = req.body;
    const skill = await service.create(workspaceId, {
      name: body.name,
      type: body.type,
      body: body.body,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.evidence_files !== undefined ? { evidence_files: body.evidence_files } : {}),
    });
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.post(
    '/skills/:id/versions/:v/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(workspaceId, req.params.id, req.params.v);
      if (!skill) throw new NotFoundError('Skill or version not found');
      return skill;
    },
  );

  app.post('/skills/fetch-url', { schema: { body: FetchUrlBody } }, async (req) => {
    return service.fetchUrlPreview(req.body.url);
  });
}
