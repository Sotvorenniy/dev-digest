import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { DESCRIPTION_RANGE, TOOL_DESCRIPTIONS, type ToolName } from '../src/tools/descriptions.js';

const TOTAL_BUDGET = 6_000;
const INSTRUCTIONS_RANGE: [number, number] = [300, 600];
const PARAM_RANGE: [number, number] = [40, 80];

const root = fileURLToPath(new URL('..', import.meta.url));
const err = (s: string) => process.stderr.write(`${s}\n`);

async function main(): Promise<number> {
  const transport = new StdioClientTransport({
    command: `${root}node_modules/.bin/tsx`,
    args: [`${root}src/index.ts`],
    cwd: root,
    env: { ...(process.env as Record<string, string>), DEVDIGEST_API: 'http://127.0.0.1:9' },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'measure', version: '0.0.0' });
  await client.connect(transport);
  const failures: string[] = [];
  try {
    const { tools } = await client.listTools();
    let total = 0;
    for (const t of tools) {
      const desc = t.description ?? '';
      const schemaLen = JSON.stringify(t.inputSchema).length;
      total += JSON.stringify(t).length;
      err(`${t.name.padEnd(18)} description=${desc.length} inputSchema=${schemaLen}`);
      const name = t.name as ToolName;
      if (!(name in TOOL_DESCRIPTIONS)) {
        failures.push(`unexpected tool ${t.name}`);
        continue;
      }
      if (desc !== TOOL_DESCRIPTIONS[name]) failures.push(`${t.name}: description differs from constant`);
      const [lo, hi] = DESCRIPTION_RANGE[name];
      if (desc.length < lo || desc.length > hi) failures.push(`${t.name}: description length ${desc.length} outside ${lo}-${hi}`);
      if ((t as { outputSchema?: unknown }).outputSchema) failures.push(`${t.name}: has outputSchema`);
      const props = (t.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      for (const [p, def] of Object.entries(props)) {
        const n = def.description?.length ?? 0;
        if (n < PARAM_RANGE[0] || n > PARAM_RANGE[1]) failures.push(`${t.name}.${p}: param description length ${n} outside 40-80`);
      }
    }
    for (const n of Object.keys(TOOL_DESCRIPTIONS)) {
      if (!tools.some((t) => t.name === n)) failures.push(`missing tool ${n}`);
    }
    const instructions = client.getInstructions() ?? '';
    err(`instructions length=${instructions.length}`);
    if (instructions.length < INSTRUCTIONS_RANGE[0] || instructions.length > INSTRUCTIONS_RANGE[1]) {
      failures.push(`instructions length ${instructions.length} outside 300-600`);
    }
    total += instructions.length;
    err(`TOTAL chars=${total} (~${Math.ceil(total / 4)} tokens), budget ${TOTAL_BUDGET}`);
    if (total > TOTAL_BUDGET) failures.push(`total ${total} chars exceeds ${TOTAL_BUDGET}`);
  } finally {
    await client.close();
  }
  for (const f of failures) err(`FAIL: ${f}`);
  err(failures.length ? 'measure: FAILED' : 'measure: ok');
  return failures.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    err(`measure crashed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
