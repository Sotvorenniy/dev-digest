import type { RepoIntel } from '../../src/modules/repo-intel/index.js';

/**
 * Minimal `RepoIntel` stub for conventions-pipeline tests: only
 * `getConventionSamples` does real work (returns the fixed `samplePaths`,
 * sliced to `n`, mirroring the real facade's "top-N ranked, filtered" shape
 * closely enough for the pipeline under test). Every other method returns a
 * degraded/empty result — the conventions scan pipeline never calls them.
 */
export function makeStubRepoIntel(samplePaths: string[]): RepoIntel {
  return {
    async indexRepo() {
      return { status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 };
    },
    async refreshIndex() {
      return { status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 };
    },
    async getIndexState(repoId: string) {
      return {
        repoId,
        status: 'degraded' as const,
        filesIndexed: 0,
        filesSkipped: 0,
        durationMs: 0,
        lastIndexedSha: '',
        indexerVersion: 0,
        updatedAt: new Date(0),
      };
    },
    async getBlastRadius() {
      return { changedSymbols: [], callers: [], impactedEndpoints: [] };
    },
    async getRepoMap() {
      return { text: '', tokens: 0, cached: false };
    },
    async getFileRank() {
      return [];
    },
    async getSymbolsInFiles() {
      return [];
    },
    async getCallerSignatures() {
      return [];
    },
    async getUnresolvedReferences() {
      return [];
    },
    async getConventionSamples(_repoId: string, n: number) {
      return samplePaths.slice(0, n);
    },
    async getTopFilesByRank(_repoId: string, n: number) {
      return samplePaths.slice(0, n);
    },
    async getCriticalPaths() {
      return [];
    },
  };
}
