import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * finding-digest module.
 *   GET /pulls/:id/digest          → findings of a PR grouped by severity
 *   GET /pulls/:id/digest/accepted → number of accepted findings of a PR
 */
export default async function findingDigestRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.findingDigestService;

  app.get('/pulls/:id/digest', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.digest(workspaceId, req.params.id);
  });

  app.get('/pulls/:id/digest/accepted', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const [row] = await container.db
      .select({ accepted: sql<number>`count(*)::int` })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.reviews.prId, req.params.id),
          isNotNull(t.findings.acceptedAt),
        ),
      );
    return { pr_id: req.params.id, accepted: row?.accepted ?? 0 };
  });
}
