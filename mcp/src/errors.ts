import { ApiError } from './api/client.js';

/** An expected failure whose message already names the next step. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/** One text block of compact (minified) JSON. */
export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

export function errorResult(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Maps anything thrown to a short isError result; never leaks bodies or stacks. */
export function toErrorResult(err: unknown): ToolResult {
  if (err instanceof ToolError || err instanceof ApiError) return errorResult(err.message);
  return errorResult('unexpected error in the devdigest MCP server; retry, or check its stderr log');
}
