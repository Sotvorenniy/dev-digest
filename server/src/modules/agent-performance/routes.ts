import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AgentPerf, AgentStats } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MAX_PERIOD_MS } from './constants.js';
import type { Period } from './domain.js';

const PeriodQuery = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .superRefine((q, ctx) => {
    const from = Date.parse(q.from);
    const to = Date.parse(q.to);
    if (from >= to) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must be after from' });
    } else if (to - from > MAX_PERIOD_MS) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'period must not exceed 366 days' });
    }
  });

const toPeriod = (q: z.infer<typeof PeriodQuery>): Period => ({ from: new Date(q.from), to: new Date(q.to) });

/**
 * agent-performance module (read-only).
 *   GET /agents/performance  → per-agent KPIs + cost breakdowns for a period
 *   GET /agents/:id/stats    → one agent's stats for a period (same reducer)
 * The static `performance` segment outranks `:id` in Fastify's router.
 */
export default async function agentPerformanceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.agentPerformanceService;

  app.get(
    '/agents/performance',
    { schema: { querystring: PeriodQuery, response: { 200: AgentPerf } } },
    async (req): Promise<AgentPerf> => {
      const { workspaceId } = await getContext(container, req);
      return service.performance(workspaceId, toPeriod(req.query), { logger: req.log });
    },
  );

  app.get(
    '/agents/:id/stats',
    { schema: { params: IdParams, querystring: PeriodQuery, response: { 200: AgentStats } } },
    async (req): Promise<AgentStats> => {
      const { workspaceId } = await getContext(container, req);
      return service.agentStats(workspaceId, req.params.id, toPeriod(req.query), { logger: req.log });
    },
  );
}
