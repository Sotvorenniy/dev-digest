import type { BlastRadius } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { toBlastRadius } from './mapper.js';
import type { BlastIntelPort, BlastLogger, BlastRepositoryPort } from './ports.js';

export interface BlastDeps {
  repo: BlastRepositoryPort;
  repoIntel: BlastIntelPort;
}

/** Reads the precomputed blast radius of a PR from the repo index. No model call, no recompute. */
export class BlastService {
  constructor(private readonly deps: BlastDeps) {}

  async get(workspaceId: string, prId: string, ctx: { logger?: BlastLogger } = {}): Promise<BlastRadius> {
    const { repo, repoIntel } = this.deps;
    const pull = await repo.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('pull request not found');
    const paths = await repo.listFilePaths(prId);
    const result = await repoIntel.getBlastRadius(pull.repoId, paths);
    const out = toBlastRadius(result);
    // Metadata only: ids, counts and the degraded flag — never paths or symbol names.
    ctx.logger?.info(
      {
        prId,
        repoId: pull.repoId,
        changedFiles: paths.length,
        symbols: out.changed_symbols.length,
        impacts: out.downstream.length,
        callers: out.downstream.reduce((n, d) => n + d.callers.length, 0),
        degraded: out.degraded ?? false,
      },
      'blast.read',
    );
    return out;
  }
}
