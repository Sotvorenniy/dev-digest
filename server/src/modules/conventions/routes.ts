import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionCandidateStatus, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import {
  CONVENTION_SCAN_JOB_KIND,
  CONVENTION_SCAN_JOB_RETRIES,
  CONVENTION_SCAN_JOB_TIMEOUT_MS,
} from './constants.js';

/**
 * conventions HTTP module — scan an imported repo for code-style conventions,
 * review candidates (accept/reject/edit), and merge accepted candidates into a
 * new Skill.
 *
 *   GET   /repos/:id/conventions              → { candidates, scan }
 *   POST  /repos/:id/conventions/scan         → 202 { status:'accepted', jobId }
 *   POST  /repos/:id/conventions/extract      → alias of /scan
 *   PATCH /repos/:id/conventions/:candidateId → { status?, rule?, evidence_snippet? } → updated candidate
 *   POST  /repos/:id/conventions/skill        → { name, description?, type?, enabled?, body } → 201 Skill
 *
 * Job-handler registration AND enqueue live here (mirrors repo-intel's
 * `/resync`, which also calls `container.jobs.enqueue` directly from
 * routes.ts): `ConventionsService` depends on ports only, never `Container`,
 * so the one genuinely-Container-needing step (JobRunner) stays at this
 * presentation-layer edge instead of being injected into the service.
 */

interface ScanJobPayload {
  workspaceId: string;
  repoId: string;
}

/** `/repos/:id/conventions/:candidateId` — both ids are uuids. */
const CandidateParams = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
});

const UpdateCandidateBody = z.object({
  status: ConventionCandidateStatus.optional(),
  rule: z.string().min(1).optional(),
  evidence_snippet: z.string().min(1).optional(),
});

const CreateSkillFromConventionsBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType.optional(),
  enabled: z.boolean().optional(),
  body: z.string().min(1),
  agent_id: z.string().uuid().optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.conventionsService;

  container.jobs.register(
    CONVENTION_SCAN_JOB_KIND,
    async (payload) => {
      const { workspaceId, repoId } = payload as ScanJobPayload;
      await service.executeScan(workspaceId, repoId);
    },
    { timeoutMs: CONVENTION_SCAN_JOB_TIMEOUT_MS, retries: CONVENTION_SCAN_JOB_RETRIES },
  );

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const [candidates, scan] = await Promise.all([
      service.listCandidates(workspaceId, req.params.id),
      service.getScanState(req.params.id),
    ]);
    return { candidates, scan };
  });

  const startScan = async (
    req: { params: { id: string } } & Parameters<typeof getContext>[1],
    reply: { code: (n: number) => unknown },
  ) => {
    const { workspaceId } = await getContext(container, req);
    const repoId = req.params.id;
    await service.requestScan(repoId);
    reply.code(202);
    // 202 even when enqueue fails (no handler / DB hiccup) — same degraded
    // contract as repo-intel's `/resync`. The actual outcome is always
    // observable via GET /repos/:id/conventions's `scan` field.
    try {
      const job = await container.jobs.enqueue(workspaceId, CONVENTION_SCAN_JOB_KIND, {
        workspaceId,
        repoId,
      } satisfies ScanJobPayload);
      return { status: 'accepted', jobId: job.id };
    } catch {
      await service.recordScanEnqueueFailure(repoId, 'no_handler');
      return { status: 'accepted', degraded: true, reason: 'no_handler' };
    }
  };
  app.post('/repos/:id/conventions/scan', { schema: { params: IdParams } }, startScan);
  // `extract` is the product-facing name; `scan` is kept for back-compat.
  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, startScan);

  app.patch(
    '/repos/:id/conventions/:candidateId',
    { schema: { params: CandidateParams, body: UpdateCandidateBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.editCandidate(
        workspaceId,
        req.params.id,
        req.params.candidateId,
        req.body,
      );
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillFromConventionsBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.createSkillFromAccepted(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skill;
    },
  );
}
