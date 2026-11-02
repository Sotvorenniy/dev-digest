import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ConfigError } from '../../platform/errors.js';

const BUNDLE_URL = new URL('../../../../agent-runner/dist/index.js', import.meta.url);

/** Reads the pre-built agent-runner bundle from the repo checkout. */
export async function readLocalRunnerBundle(): Promise<string> {
  try {
    return await readFile(fileURLToPath(BUNDLE_URL), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigError(
        'Runner bundle not found at agent-runner/dist/index.js — build it: cd agent-runner && pnpm build',
      );
    }
    throw err;
  }
}
