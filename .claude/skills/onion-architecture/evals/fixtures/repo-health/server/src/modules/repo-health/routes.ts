import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * repo-health module.
 *   GET /repos/:id/health → open / stale PR counts and a health status
 */
export default async function repoHealthRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.repoHealthService;

  app.get('/repos/:id/health', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const health = await service.health(workspaceId, req.params.id, reply);
    if (!health) return reply;
    return {
      repo_id: health.repoId,
      open_pulls: health.openPulls,
      stale_pulls: health.stalePulls,
      last_polled_at: health.lastPolledAt?.toISOString() ?? null,
      status: health.status,
    };
  });
}
