import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CiExport, CiExportInput, CiInstallation } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CI_EXPORT_RATE_LIMIT, CI_TRIGGERS } from './constants.js';

/** Tighter than the shared `CiExportInput`: GitHub Actions only, enum triggers, branch-safe base. */
const ExportBody = CiExportInput.extend({
  repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  target: z.literal('gha').default('gha'),
  triggers: z
    .array(z.enum(CI_TRIGGERS))
    .min(1)
    .default([...CI_TRIGGERS])
    .transform((v) => [...new Set(v)]),
  base: z
    .string()
    .regex(/^[A-Za-z0-9._/-]+$/)
    .refine((v) => !v.includes('..') && !v.startsWith('/') && !v.startsWith('-'))
    .default('main'),
});

/**
 * ci module.
 *   POST /agents/:id/export-ci       → preview files or open/update the install PR
 *   GET  /agents/:id/ci-installations → the agent's installations, newest first
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.ciService;

  app.post(
    '/agents/:id/export-ci',
    {
      schema: { params: IdParams, body: ExportBody, response: { 200: CiExport } },
      config: { rateLimit: CI_EXPORT_RATE_LIMIT },
    },
    async (req): Promise<CiExport> => {
      const { workspaceId } = await getContext(container, req);
      const { repo, action, post_as, triggers, base } = req.body;
      return service.exportCi(
        workspaceId,
        req.params.id,
        { repo, action, postAs: post_as, triggers, base },
        { logger: req.log },
      );
    },
  );

  app.get(
    '/agents/:id/ci-installations',
    { schema: { params: IdParams, response: { 200: z.array(CiInstallation) } } },
    async (req): Promise<CiInstallation[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listInstallations(workspaceId, req.params.id);
    },
  );
}
