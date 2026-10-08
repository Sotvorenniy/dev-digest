import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApiClient } from './api/client.js';
import { loadConfig } from './config.js';
import { log } from './log.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env, log);
  const api = createApiClient({ baseUrl: config.baseUrl });
  const server = createServer({ api });

  process.on('uncaughtException', (err) => log(`uncaughtException: ${err.message}`));
  process.on('unhandledRejection', (reason) =>
    log(`unhandledRejection: ${reason instanceof Error ? reason.message : String(reason)}`),
  );
  const shutdown = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.connect(new StdioServerTransport());
  log(`ready; API ${config.baseUrl}`);
}

main().catch((err: unknown) => {
  log(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
