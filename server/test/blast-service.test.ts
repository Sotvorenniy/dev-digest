/** BlastService with fake ports: 404, facade arguments, mapping and the metadata-only log. */
import { describe, it, expect } from 'vitest';
import { BlastService } from '../src/modules/blast/service.js';
import type { BlastIntelPort, BlastRepositoryPort } from '../src/modules/blast/ports.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';
import { NotFoundError } from '../src/platform/errors.js';

const empty: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };

function fakeRepo(over: Partial<BlastRepositoryPort> = {}): BlastRepositoryPort {
  return {
    findPull: async () => ({ id: 'pr-1', repoId: 'repo-1' }),
    listFilePaths: async () => ['src/lib.ts', 'src/other.ts'],
    ...over,
  };
}

describe('BlastService.get', () => {
  it('throws NotFoundError when the PR is not in the workspace', async () => {
    const svc = new BlastService({
      repo: fakeRepo({ findPull: async () => null }),
      repoIntel: { getBlastRadius: async () => empty },
    });
    await expect(svc.get('ws', 'pr-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('passes the PR repoId and changed file paths to the facade', async () => {
    const calls: [string, string[]][] = [];
    const repoIntel: BlastIntelPort = {
      getBlastRadius: async (repoId, files) => {
        calls.push([repoId, files]);
        return empty;
      },
    };
    await new BlastService({ repo: fakeRepo(), repoIntel }).get('ws', 'pr-1');
    expect(calls).toEqual([['repo-1', ['src/lib.ts', 'src/other.ts']]]);
  });

  it('maps the facade result and passes degraded through', async () => {
    const svc = new BlastService({
      repo: fakeRepo(),
      repoIntel: { getBlastRadius: async () => ({ ...empty, degraded: true, reason: 'flag_off' }) },
    });
    const out = await svc.get('ws', 'pr-1');
    expect(out.degraded).toBe(true);
    expect(out.degraded_reason).toBe('flag_off');
  });

  it('logs one blast.read info line with counts only, never paths or symbols', async () => {
    const logs: { obj: Record<string, unknown>; msg?: string }[] = [];
    const svc = new BlastService({
      repo: fakeRepo(),
      repoIntel: {
        getBlastRadius: async () => ({
          changedSymbols: [{ name: 'secretSymbol', file: 'src/lib.ts', kind: 'function' }],
          callers: [{ file: 'src/a.ts', symbol: 'a', viaSymbol: 'secretSymbol', line: 3, rank: 0 }],
          impactedEndpoints: [],
        }),
      },
    });
    await svc.get('ws', 'pr-1', { logger: { info: (obj, msg) => logs.push({ obj: obj as Record<string, unknown>, msg }) } });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.msg).toBe('blast.read');
    expect(logs[0]!.obj).toMatchObject({ prId: 'pr-1', repoId: 'repo-1', symbols: 1, callers: 1, degraded: false });
    expect(JSON.stringify(logs[0]!.obj)).not.toMatch(/secretSymbol|src\//);
  });
});
