import type { ApiClient } from '../api/client.js';

export interface Deps {
  api: ApiClient;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface Extra {
  signal?: AbortSignal;
}

export interface ToolAnnotationsLite {
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint: boolean;
}
