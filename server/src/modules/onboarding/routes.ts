import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { OnboardingGenerateResponse, OnboardingState } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import {
  GENERATE_RATE_LIMIT,
  ONBOARDING_JOB_KIND,
  ONBOARDING_JOB_RETRIES,
  ONBOARDING_JOB_TIMEOUT_MS,
} from './constants.js';
import type { OnboardingJobPayload } from './ports.js';

/**
 * onboarding module.
 *   GET  /repos/:id/onboarding           → state + stored tour (never generates)
 *   POST /repos/:id/onboarding/generate  → 202 {status, job_id}; joins a running job; 409 when not indexed
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.onboardingService;

  container.jobs.register(
    ONBOARDING_JOB_KIND,
    async (payload) => {
      await service.generate(payload as OnboardingJobPayload, { logger: app.log });
    },
    { timeoutMs: ONBOARDING_JOB_TIMEOUT_MS, retries: ONBOARDING_JOB_RETRIES },
  );

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams } },
    async (req): Promise<OnboardingState> => {
      const { workspaceId } = await getContext(container, req);
      return service.getState(workspaceId, req.params.id);
    },
  );

  // Each accepted request can spend an LLM call: tight per-route limit.
  app.post(
    '/repos/:id/onboarding/generate',
    { schema: { params: IdParams }, config: { rateLimit: GENERATE_RATE_LIMIT } },
    async (req, reply): Promise<OnboardingGenerateResponse> => {
      const { workspaceId } = await getContext(container, req);
      const res = await service.requestGeneration(workspaceId, req.params.id);
      reply.code(202);
      return res;
    },
  );
}
