import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isErr, textOf } from './helpers/fake-api.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

describe('stdio smoke (spawns src/index.ts)', () => {
  let client: Client;
  let transport: StdioClientTransport;
  const errors: Error[] = [];
  let stderr = '';

  beforeAll(async () => {
    const port = await unusedPort();
    transport = new StdioClientTransport({
      command: `${ROOT}node_modules/.bin/tsx`,
      args: ['src/index.ts'],
      cwd: ROOT,
      env: { ...(process.env as Record<string, string>), DEVDIGEST_API: `http://127.0.0.1:${port}` },
      stderr: 'pipe',
    });
    transport.onerror = (e) => errors.push(e);
    transport.stderr?.on('data', (d) => { stderr += String(d); });
    client = new Client({ name: 'smoke', version: '0.0.0' });
    await client.connect(transport);
  }, 20_000);

  afterAll(async () => {
    await client?.close();
  });

  it('initializes, lists 5 tools, blast radius is isError, list_agents says not reachable', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);

    const blast = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'a/b', pr: 1 } });
    expect(isErr(blast)).toBe(true);

    const agents = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(isErr(agents)).toBe(true);
    expect(textOf(agents)).toContain('not reachable');
  }, 20_000);

  it('stdout stayed clean: no transport parse errors; diagnostics only on stderr', () => {
    expect(errors).toEqual([]);
    expect(stderr).toContain('[devdigest-mcp] ready');
  });
});
