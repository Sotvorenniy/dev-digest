import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq, sql } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { toTriageDto } from './helpers.js';

/**
 * pr-triage module.
 *   GET /repos/:id/triage        → open PRs of a repo ordered by triage priority
 *   GET /repos/:id/triage/count  → number of open PRs waiting for triage
 */
export default async function prTriageRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.triageService;

  app.get('/repos/:id/triage', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const items = await service.queue(workspaceId, req.params.id);
    return items.map(toTriageDto);
  });

  app.get('/repos/:id/triage/count', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const [row] = await container.db
      .select({ open: sql<number>`count(*)::int` })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.repoId, req.params.id)));
    return { repo_id: req.params.id, open: row?.open ?? 0 };
  });
}
