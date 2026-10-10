import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * blast module.
 *   GET /pulls/:id/blast → downstream impact of the PR's changed symbols, read from the repo index
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.blastService;

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadius } } },
    async (req): Promise<BlastRadius> => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id, { logger: req.log });
    },
  );
}
