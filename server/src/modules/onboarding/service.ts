import type {
  FeatureModelChoice,
  LLMProvider,
  OnboardingIndexStatus,
  OnboardingSections,
  OnboardingSkeletonReason,
  OnboardingState,
  OnboardingTour,
  Provider,
} from '@devdigest/shared';
import { ConfigError, NotFoundError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import type { RootFilesSnapshot } from '../../ports/root-files.js';
import type { RankedFileRow } from '../repo-intel/types.js';
import type {
  OnboardingJobPayload,
  OnboardingJobsPort,
  OnboardingLogPort,
  OnboardingRepoIntelPort,
  OnboardingRepositoryPort,
  OnboardingRootFilesPort,
} from './ports.js';
import {
  RepoNotIndexedError,
  buildSkeletonSections,
  churnAvailable,
  deriveCandidateCommands,
  deriveStack,
  deriveStructure,
  groundModelSections,
  isUsable,
  readmeRunExcerpt,
  selectFactFiles,
  selectReadingPath,
  skeletonReasonForIndex,
} from './domain.js';
import { MAX_OUTPUT_TOKENS, LLM_TIMEOUT_MS } from './constants.js';
import { OnboardingModelOutput, assemblePrompt, type OnboardingFacts } from './prompt.js';

/**
 * OnboardingService — state, generation requests, and the (single-LLM-call) tour
 * generation. Depends on ports only (never `Container`). The in-flight map is
 * in-memory: it lives on the memoized instance, so it is lost on restart.
 */

export interface OnboardingServiceDeps {
  repo: OnboardingRepositoryPort;
  repoIntel: OnboardingRepoIntelPort;
  rootFiles: OnboardingRootFilesPort;
  jobs: OnboardingJobsPort;
  /** A provider that makes exactly one HTTP request per structured call. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  systemPrompt: () => Promise<string>;
  now?: () => Date;
  limits?: Partial<{ llmTimeoutMs: number }>;
}

/** Facts gathered so far; lets the failure path build a skeleton from whatever exists. */
interface Collected {
  rows: RankedFileRow[];
  chains: string[][];
  snapshot: RootFilesSnapshot | null;
}

/** Everything the `onboarding.generated` line reports. Counts and ids only. */
interface GenMeta {
  indexedSha: string;
  model: string | null;
  llmCalls: 0 | 1;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  outcome: 'ai' | 'skeleton';
  skeletonReason: OnboardingSkeletonReason | null;
  droppedPaths: number;
  truncated: boolean;
}

const asIndexStatus = (s: string): OnboardingIndexStatus =>
  s === 'full' || s === 'partial' || s === 'failed' ? s : 'degraded';

export class OnboardingService {
  /** repoId → job id of the generation currently running. */
  private inFlight = new Map<string, Promise<string>>();

  constructor(private readonly deps: OnboardingServiceDeps) {}

  async getState(workspaceId: string, repoId: string): Promise<OnboardingState> {
    const { repo, repoIntel } = this.deps;
    const found = await repo.findRepo(workspaceId, repoId);
    if (!found) throw new NotFoundError('Repository not found');

    const usable = isUsable(found.clonePath, await repoIntel.hasIndexState(repoId));
    const idx = await repoIntel.getIndexState(repoId);
    const lastSha = idx.lastIndexedSha === '' ? null : idx.lastIndexedSha;
    const tour = await repo.getTour(repoId);

    let jobId: string | null = null;
    const running = this.inFlight.get(repoId);
    if (running) jobId = await running.catch(() => null);

    const status: OnboardingState['status'] = jobId ? 'generating' : tour ? 'ready' : 'none';
    return {
      status,
      job_id: jobId,
      index: {
        status: asIndexStatus(idx.status),
        usable,
        files_indexed: idx.filesIndexed,
        last_indexed_sha: lastSha,
      },
      is_stale: !!tour && tour.indexed_sha !== (lastSha ?? ''),
      tour,
    };
  }

  async requestGeneration(
    workspaceId: string,
    repoId: string,
  ): Promise<{ status: 'generating'; job_id: string }> {
    const { repo, repoIntel, jobs } = this.deps;
    const found = await repo.findRepo(workspaceId, repoId);
    if (!found) throw new NotFoundError('Repository not found');
    if (!isUsable(found.clonePath, await repoIntel.hasIndexState(repoId))) {
      throw new RepoNotIndexedError();
    }

    // No await between this check and the `set` below: two requests cannot both create a job.
    const existing = this.inFlight.get(repoId);
    if (existing) return { status: 'generating', job_id: await existing };

    const clear = (): void => {
      if (this.inFlight.get(repoId) === idPromise) this.inFlight.delete(repoId);
    };
    const idPromise: Promise<string> = jobs.enqueue(workspaceId, { workspaceId, repoId }).then((job) => {
      void job.done.then(clear, clear);
      return job.id;
    });
    // An enqueue rejection frees the slot so the next request can start a new job.
    idPromise.catch(clear);
    this.inFlight.set(repoId, idPromise);
    return { status: 'generating', job_id: await idPromise };
  }

  /**
   * Job body. Always resolves (the job must not be retried): any failure is stored as
   * an `ai_failed` skeleton, and exactly one metadata-only log line is written.
   */
  async generate(payload: OnboardingJobPayload, ctx: { logger: OnboardingLogPort }): Promise<void> {
    const { repo } = this.deps;
    const started = Date.now();
    const meta: GenMeta = {
      indexedSha: '',
      model: null,
      llmCalls: 0,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      outcome: 'skeleton',
      skeletonReason: null,
      droppedPaths: 0,
      truncated: false,
    };
    const collected: Collected = { rows: [], chains: [], snapshot: null };
    let filesIndexed = 0;
    let indexStatus: OnboardingIndexStatus = 'degraded';

    try {
      let tour: OnboardingTour | null = null;
      try {
        const found = await repo.findRepo(payload.workspaceId, payload.repoId);
        if (!found) return;
        const idx = await this.deps.repoIntel.getIndexState(payload.repoId);
        meta.indexedSha = idx.lastIndexedSha;
        filesIndexed = idx.filesIndexed;
        indexStatus = asIndexStatus(idx.status);
        tour = await this.build(payload, found, idx.status, collected, meta);
      } catch {
        // Infrastructure failure (any error that is not the handled ConfigError): still leave a tour.
        meta.outcome = 'skeleton';
        meta.skeletonReason = 'ai_failed';
        tour = this.makeTour(
          buildSkeletonSections(this.skeletonInput(collected)),
          collected,
          meta,
          filesIndexed,
          indexStatus,
        );
      }
      try {
        await repo.saveTour(payload.repoId, tour);
      } catch {
        ctx.logger.warn({ event: 'onboarding.save_failed', repo_id: payload.repoId });
      }
    } finally {
      ctx.logger.info(
        {
          event: 'onboarding.generated',
          repo_id: payload.repoId,
          indexed_sha: meta.indexedSha,
          model: meta.model,
          llm_calls: meta.llmCalls,
          tokens_in: meta.tokensIn,
          tokens_out: meta.tokensOut,
          cost_usd: meta.costUsd,
          duration_ms: Date.now() - started,
          outcome: meta.outcome,
          skeleton_reason: meta.skeletonReason,
          dropped_paths: meta.droppedPaths,
          truncated: meta.truncated,
        },
        'onboarding.generated',
      );
    }
  }

  // ---- internals ---------------------------------------------------------------

  private skeletonInput(c: Collected): Parameters<typeof buildSkeletonSections>[0] {
    return {
      structure: deriveStructure(c.rows),
      criticalChains: c.chains,
      candidates: deriveCandidateCommands(c.snapshot),
      readingPath: selectReadingPath(c.rows),
    };
  }

  private makeTour(
    sections: OnboardingSections,
    c: Collected,
    meta: GenMeta,
    filesIndexed: number,
    indexStatus: OnboardingIndexStatus,
  ): OnboardingTour {
    return {
      generated_at: (this.deps.now?.() ?? new Date()).toISOString(),
      indexed_sha: meta.indexedSha,
      files_indexed: filesIndexed,
      index_status: indexStatus,
      outcome: meta.outcome,
      skeleton_reason: meta.skeletonReason,
      churn_available: churnAvailable(c.rows),
      truncated: meta.truncated,
      dropped_paths: meta.droppedPaths,
      model: meta.model,
      llm_calls: meta.llmCalls,
      tokens_in: meta.tokensIn,
      tokens_out: meta.tokensOut,
      cost_usd: meta.costUsd,
      sections,
    };
  }

  private async build(
    payload: OnboardingJobPayload,
    found: { owner: string; name: string },
    status: Parameters<typeof skeletonReasonForIndex>[0],
    c: Collected,
    meta: GenMeta,
  ): Promise<OnboardingTour> {
    const { repoIntel, rootFiles } = this.deps;
    const idx = await repoIntel.getIndexState(payload.repoId);
    c.rows = await repoIntel.getRankedFiles(payload.repoId);
    c.chains = await repoIntel.getCriticalPaths(payload.repoId);
    c.snapshot = await rootFiles.read({ owner: found.owner, name: found.name });

    const filesIndexed = idx.filesIndexed;
    const indexStatus = asIndexStatus(idx.status);
    const skeletonInput = this.skeletonInput(c);
    const skeleton = buildSkeletonSections(skeletonInput);
    const finish = (sections: OnboardingSections): OnboardingTour =>
      this.makeTour(sections, c, meta, filesIndexed, indexStatus);

    const indexReason = skeletonReasonForIndex(status, filesIndexed, c.rows.length);
    if (indexReason) {
      meta.skeletonReason = indexReason;
      return finish(skeleton);
    }

    // ---- model + provider (no request yet)
    const choice = await this.deps.resolveModel(payload.workspaceId);
    let llm: LLMProvider;
    try {
      llm = await this.deps.llm(choice.provider);
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      meta.skeletonReason = 'no_api_key';
      return finish(skeleton);
    }

    // ---- prompt
    const factFiles = selectFactFiles(c.rows);
    const factRows = await repoIntel.getFileFacts(
      payload.repoId,
      factFiles.map((f) => f.path),
    );
    const endpointsByPath = new Map(factRows.map((r) => [r.path, r.endpoints]));
    const facts: OnboardingFacts = {
      readingPath: skeletonInput.readingPath,
      factFiles: factFiles.map((f) => ({ ...f, endpoints: endpointsByPath.get(f.path) ?? [] })),
      criticalPaths: c.chains,
      candidates: skeletonInput.candidates,
      stack: deriveStack(c.snapshot, c.rows),
      structure: skeletonInput.structure,
      readmeExcerpt: readmeRunExcerpt(c.snapshot),
    };
    const prompt = assemblePrompt(facts, await this.deps.systemPrompt());
    meta.truncated = prompt.truncated;
    if (prompt.overBudget) {
      meta.skeletonReason = 'ai_failed';
      return finish(skeleton);
    }

    // ---- exactly one request, no repair, no transport retry
    meta.model = choice.model;
    meta.llmCalls = 1;
    const timeoutMs = this.deps.limits?.llmTimeoutMs ?? LLM_TIMEOUT_MS;
    let result: Awaited<ReturnType<LLMProvider['completeStructured']>> & { data: OnboardingModelOutput };
    try {
      result = (await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: OnboardingModelOutput,
          schemaName: 'OnboardingTour',
          messages: prompt.messages,
          maxTokens: MAX_OUTPUT_TOKENS,
          timeoutMs,
          maxRetries: 0,
          temperature: 0,
        }),
        timeoutMs,
      )) as typeof result;
    } catch {
      meta.skeletonReason = 'ai_failed';
      return finish(skeleton);
    }

    meta.model = result.model || choice.model;
    meta.tokensIn = result.tokensIn;
    meta.tokensOut = result.tokensOut;
    meta.costUsd = result.costUsd;
    const grounded = groundModelSections(result.data, {
      indexed: new Set(c.rows.map((r) => r.path)),
      candidates: skeletonInput.candidates,
      readingPath: skeletonInput.readingPath,
      skeleton,
    });
    meta.outcome = 'ai';
    meta.skeletonReason = null;
    meta.droppedPaths = grounded.droppedPaths;
    return finish(grounded.sections);
  }
}
