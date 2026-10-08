import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api/client.js';
import { INSTRUCTIONS } from './instructions.js';
import { getBlastRadiusTool } from './tools/get-blast-radius.js';
import { getConventionsTool } from './tools/get-conventions.js';
import { getFindingsTool } from './tools/get-findings.js';
import { listAgentsTool } from './tools/list-agents.js';
import { runAgentOnPrTool } from './tools/run-agent-on-pr.js';
import type { Deps } from './tools/types.js';

export interface ServerDeps {
  api: ApiClient;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export function createServer(input: ServerDeps): McpServer {
  const deps: Deps = {
    api: input.api,
    sleep: input.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    now: input.now ?? Date.now,
  };
  const server = new McpServer(
    { name: 'devdigest', version: '0.0.0' },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(listAgentsTool.name, listAgentsTool.config, listAgentsTool.handler(deps));
  server.registerTool(runAgentOnPrTool.name, runAgentOnPrTool.config, runAgentOnPrTool.handler(deps));
  server.registerTool(getFindingsTool.name, getFindingsTool.config, getFindingsTool.handler(deps));
  server.registerTool(getConventionsTool.name, getConventionsTool.config, getConventionsTool.handler(deps));
  server.registerTool(getBlastRadiusTool.name, getBlastRadiusTool.config, getBlastRadiusTool.handler());
  return server;
}
