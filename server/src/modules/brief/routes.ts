import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBrief } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BRIEF_GENERATE_RATE_LIMIT } from './constants.js';

/**
 * brief module.
 *   GET  /pulls/:id/brief → the stored brief; 404 when none (never generates)
 *   POST /pulls/:id/brief → generates one (one LLM call), stores and returns it; joins a running run
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.briefService;

  // Clients may POST with `content-type: application/json` and no body; the default
  // parser rejects that with 400. Encapsulated: applies to this module's routes only.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = Object.assign(new Error('Invalid JSON body'), { statusCode: 400 });
      done(err, undefined);
    }
  });

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBrief } } },
    async (req): Promise<PrBrief> => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  // Each accepted request can spend an LLM call: tight per-route limit.
  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBrief } },
      config: { rateLimit: BRIEF_GENERATE_RATE_LIMIT },
    },
    async (req): Promise<PrBrief> => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id, { logger: req.log });
    },
  );
}
