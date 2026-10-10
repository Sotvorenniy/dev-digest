import { z } from 'zod';
import { AgentLite } from '../api/schemas.js';
import { AGENT_DESC_CLIP, MAX_AGENTS } from '../constants.js';
import { jsonResult, toErrorResult } from '../errors.js';
import { clip, compact } from '../format.js';
import { TOOL_DESCRIPTIONS } from './descriptions.js';
import type { Deps, Extra } from './types.js';

const inputSchema = {
  include_disabled: z
    .boolean()
    .optional()
    .describe('Also list disabled agents (default false: enabled agents only)'),
};

const AgentList = z.array(AgentLite);

export const listAgentsTool = {
  name: 'list_agents' as const,
  config: {
    description: TOOL_DESCRIPTIONS.list_agents,
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler:
    (deps: Deps) =>
    async (args: { include_disabled?: boolean }, extra: Extra) => {
      try {
        const agents = await deps.api.get('/agents', AgentList, extra.signal);
        const shown = agents.filter((a) => args.include_disabled || a.enabled);
        const page = shown.slice(0, MAX_AGENTS).map((a) => ({
          id: a.id,
          name: a.name,
          enabled: a.enabled,
          model: a.model,
          description: clip(a.description, AGENT_DESC_CLIP),
        }));
        return jsonResult(
          compact({ agents: page, truncated: shown.length > MAX_AGENTS ? true : undefined }),
        );
      } catch (err) {
        return toErrorResult(err);
      }
    },
};
