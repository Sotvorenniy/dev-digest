import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateEvalCaseBody,
  EvalAgentDashboard,
  EvalCase,
  EvalCaseDraft,
  EvalCaseResult,
  RunEvalCaseDraftBody,
  EvalSetRun,
  EvalSetRunDetail,
  EvalWorkspaceDashboard,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EVAL_RUN_RATE_LIMIT } from './constants.js';

/**
 * eval module.
 *   POST   /findings/:id/eval-case → turn a decided finding into an eval case (201 new, 200 existing)
 *   POST   /findings/:id/eval-case/draft → prefilled unsaved case for the modal (nothing written)
 *   POST   /agents/:id/eval-cases/run → run one unsaved case (nothing persisted)
 *   GET    /agents/:id/eval-cases  → the agent's cases
 *   DELETE /eval-cases/:id         → remove a case (past results are kept)
 *   POST   /agents/:id/eval-runs   → run the agent over all its cases (202, async)
 *   GET    /agents/:id/eval-runs   → run history, newest first
 *   GET    /eval-runs/:id          → one run with per-case results
 *   GET    /eval/dashboard         → agents with cases, latest scores, recall series, recent runs
 *   GET    /agents/:id/eval-dashboard → one agent's cards, trend and run table (404 unknown agent)
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.evalService;

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

  app.post(
    '/findings/:id/eval-case',
    {
      schema: {
        params: IdParams,
        // An empty body reaches the validator as null, not undefined.
        body: CreateEvalCaseBody.nullish(),
        response: { 200: EvalCase, 201: EvalCase },
      },
    },
    async (req, reply): Promise<EvalCase> => {
      const { workspaceId } = await getContext(container, req);
      const { evalCase, created } = await service.createCaseFromFinding(
        workspaceId,
        req.params.id,
        req.body,
        { logger: req.log },
      );
      reply.code(created ? 201 : 200);
      return evalCase;
    },
  );

  app.post(
    '/findings/:id/eval-case/draft',
    {
      schema: {
        params: IdParams,
        body: z.object({ agent_id: z.string().uuid().optional() }).nullish(),
        response: { 200: EvalCaseDraft },
      },
    },
    async (req): Promise<EvalCaseDraft> => {
      const { workspaceId } = await getContext(container, req);
      return service.draftFromFinding(workspaceId, req.params.id, req.body);
    },
  );

  // One LLM call per request: same tight limit as a set run.
  app.post(
    '/agents/:id/eval-cases/run',
    {
      schema: { params: IdParams, body: RunEvalCaseDraftBody, response: { 200: EvalCaseResult } },
      config: { rateLimit: EVAL_RUN_RATE_LIMIT },
    },
    async (req): Promise<EvalCaseResult> => {
      const { workspaceId } = await getContext(container, req);
      return service.runDraft(workspaceId, req.params.id, req.body, { logger: req.log });
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCase) } } },
    async (req): Promise<EvalCase[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      await service.deleteCase(workspaceId, req.params.id);
      reply.code(204).send();
    },
  );

  // Each accepted request can spend one LLM call per case: tight per-route limit.
  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: EvalSetRun } },
      config: { rateLimit: EVAL_RUN_RATE_LIMIT },
    },
    async (req, reply): Promise<EvalSetRun> => {
      const { workspaceId } = await getContext(container, req);
      const run = await service.startRun(workspaceId, req.params.id, { logger: req.log });
      reply.code(202);
      return run;
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalSetRun) } } },
    async (req): Promise<EvalSetRun[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listRuns(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval/dashboard',
    { schema: { response: { 200: EvalWorkspaceDashboard } } },
    async (req): Promise<EvalWorkspaceDashboard> => {
      const { workspaceId } = await getContext(container, req);
      return service.workspaceDashboard(workspaceId);
    },
  );

  app.get(
    '/agents/:id/eval-dashboard',
    { schema: { params: IdParams, response: { 200: EvalAgentDashboard } } },
    async (req): Promise<EvalAgentDashboard> => {
      const { workspaceId } = await getContext(container, req);
      return service.agentDashboard(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalSetRunDetail } } },
    async (req): Promise<EvalSetRunDetail> => {
      const { workspaceId } = await getContext(container, req);
      return service.getRun(workspaceId, req.params.id);
    },
  );
}
