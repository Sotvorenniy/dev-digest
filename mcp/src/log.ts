// stdout belongs to the MCP transport; every diagnostic goes to stderr.
export function log(message: string): void {
  process.stderr.write(`[devdigest-mcp] ${message}\n`);
}
