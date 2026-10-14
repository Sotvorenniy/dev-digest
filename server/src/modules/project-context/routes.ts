import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ContextAttachments,
  ContextAttachmentsInput,
  ContextAttachmentsSaved,
  ProjectContextFile,
  ProjectContextList,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

const FileQuery = z.object({ path: z.string() });
const AttachmentsQuery = z.object({ repo_id: z.string().min(1) });

/**
 * project-context module.
 *   GET /repos/:id/context              → Markdown docs under the search roots
 *   GET /repos/:id/context/file?path=   → one doc's content
 *   GET|PUT /agents/:id/context         → per-repo attached paths of an agent
 *   GET|PUT /skills/:id/context         → per-repo attached paths of a skill
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.projectContextService;

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ProjectContextList } } },
    async (req): Promise<ProjectContextList> => {
      const { workspaceId } = await getContext(container, req);
      return service.listDocs(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery, response: { 200: ProjectContextFile } } },
    async (req): Promise<ProjectContextFile> => {
      const { workspaceId } = await getContext(container, req);
      return service.getDoc(workspaceId, req.params.id, req.query.path);
    },
  );

  for (const kind of ['agent', 'skill'] as const) {
    const base = kind === 'agent' ? '/agents/:id/context' : '/skills/:id/context';

    app.get(
      base,
      { schema: { params: IdParams, querystring: AttachmentsQuery, response: { 200: ContextAttachments } } },
      async (req): Promise<ContextAttachments> => {
        const { workspaceId } = await getContext(container, req);
        return service.getAttachments(kind, workspaceId, req.params.id, req.query.repo_id);
      },
    );

    app.put(
      base,
      {
        schema: { params: IdParams, body: ContextAttachmentsInput, response: { 200: ContextAttachmentsSaved } },
      },
      async (req): Promise<ContextAttachmentsSaved> => {
        const { workspaceId } = await getContext(container, req);
        return service.setAttachments(kind, workspaceId, req.params.id, req.body);
      },
    );
  }
}
