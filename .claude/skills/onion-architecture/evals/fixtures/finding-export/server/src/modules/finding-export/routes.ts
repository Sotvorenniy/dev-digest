import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

const ExportQuery = z.object({
  status: z.enum(['accepted', 'dismissed', 'open', 'all']).default('all'),
});

/**
 * finding-export module.
 *   GET /pulls/:id/findings.csv?status= → findings of a PR as CSV
 */
export default async function findingExportRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.findingExportService;

  app.get(
    '/pulls/:id/findings.csv',
    { schema: { params: IdParams, querystring: ExportQuery } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const csv = await service.exportCsv(workspaceId, { prId: req.params.id, status: req.query.status });
      return reply.header('content-type', 'text/csv; charset=utf-8').send(csv);
    },
  );
}
