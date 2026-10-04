import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DeriveIntentRequest } from '@devdigest/shared';
import type { PrIntentRecord } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * intent module.
 *   GET  /pulls/:id/intent  → the persisted intent (404 when never derived; never derives)
 *   POST /pulls/:id/intent  {force?} → derive now (cache hit unless `force`); one cheap LLM call
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.intentService;

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req): Promise<PrIntentRecord> => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });

  // Tight per-route limit: each call can spend an LLM request.
  app.post(
    '/pulls/:id/intent',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req): Promise<PrIntentRecord> => {
      const { workspaceId } = await getContext(container, req);
      const body = DeriveIntentRequest.parse(req.body ?? {});
      const { record } = await service.derive(workspaceId, req.params.id, {
        force: body.force === true,
        logger: req.log,
        correlationId: req.id,
      });
      return record;
    },
  );
}
