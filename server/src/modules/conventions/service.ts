import type {
  ConventionCandidate,
  ConventionCandidateStatus,
  ConventionScanState,
  FeatureModelChoice,
  LLMProvider,
  Provider,
  Skill,
  SkillSource,
  SkillType,
} from '@devdigest/shared';
import {
  scanConventionsBatch,
  clusterCandidatesByRuleSimilarity,
  mergeConventionCandidates,
  verifyConventions,
  computeConfidence,
  CONFIDENCE_FLOOR,
  groundConventionCandidates,
  type MergedCandidate,
  type RawConventionCandidate,
} from '@devdigest/reviewer-core';
import type { RepoIntel } from '../repo-intel/types.js';
import { NotFoundError } from '../../platform/errors.js';
import type {
  AgentSkillLinkerPort,
  ConventionsRepositoryPort,
  NewConventionRow,
  UpdateConventionCandidatePatch,
} from './ports.js';
import { detectLintConfig, mergedCandidateToRow, readCloneFile, readConfigSamples } from './helpers.js';
import {
  DEFAULT_CONVENTION_SCAN_SYSTEM_PROMPT,
  EXTRACTION_BATCH_SIZE,
  EXTRACTION_CONCURRENCY,
  RANK_SAMPLE_COUNT,
  VERIFICATION_HELD_OUT_POOL_SIZE,
} from './constants.js';

/**
 * conventions service — the scan → review → create-skill business logic.
 *
 * `executeScan` is the detection pipeline (sample → lint-note → batched
 * extraction → cluster/merge → verify → score → ground → persist), built out
 * of `@devdigest/reviewer-core`'s per-step primitives.
 *
 * Depends on PORTS only — never `Container` (onion-architecture: "Services
 * and use-case files must not import type { Container }"). Job
 * enqueue/registration (which genuinely needs `container.jobs`, a concrete
 * platform class) lives in `routes.ts` instead, same as repo-intel's
 * `/resync` route — `requestScan`/`recordScanEnqueueFailure` here only write
 * the scan-status row.
 */

export interface CreateSkillFromAcceptedInput {
  name: string;
  description?: string;
  type?: SkillType;
  enabled?: boolean;
  body: string;
  /** Optional agent to link the new skill to (appended to its skill order). */
  agent_id?: string;
}

/** Narrow shape of `SkillsService.create` — avoids importing another module's `service.ts`. */
export interface SkillsCreatorPort {
  create(
    workspaceId: string,
    input: {
      name: string;
      description?: string;
      type: SkillType;
      source?: SkillSource;
      body: string;
      enabled?: boolean;
      evidence_files?: string[];
    },
  ): Promise<Skill>;
}

export interface ConventionsServiceDeps {
  repo: ConventionsRepositoryPort;
  /** repo-intel facade — only the one method this pipeline needs. */
  repoIntel: Pick<RepoIntel, 'getConventionSamples'>;
  /** Resolve an LLM provider by id (bound to `container.llm`). */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** Resolve the workspace's chosen (or default) model for the 'conventions' feature. */
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  skills: SkillsCreatorPort;
  agentLinker?: AgentSkillLinkerPort;
}

export class ConventionsService {
  constructor(private deps: ConventionsServiceDeps) {}

  listCandidates(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    return this.deps.repo.listVisible(workspaceId, repoId);
  }

  getScanState(repoId: string): Promise<ConventionScanState> {
    return this.deps.repo.getScanState(repoId);
  }

  /** Mark the repo `queued`. The caller (routes.ts) enqueues the job on `container.jobs` next. */
  async requestScan(repoId: string): Promise<void> {
    // Clear a previous run's terminal fields explicitly — `upsertScanState`
    // otherwise carries `error`/`finishedAt` forward when a patch doesn't
    // mention them, which left a stale error visible next to a fresh
    // `queued`/`running` status on re-scan (found via live testing).
    await this.deps.repo.upsertScanState(repoId, { status: 'queued', error: null });
  }

  /** The job couldn't even be enqueued (no handler / DB hiccup) — never leave the row stuck `queued`. */
  async recordScanEnqueueFailure(repoId: string, error: string): Promise<void> {
    await this.deps.repo.upsertScanState(repoId, {
      status: 'failed',
      error,
      finishedAt: new Date(),
    });
  }

  /**
   * The detection pipeline. ALWAYS resolves — every failure path (missing
   * clone, no API key, LLM error, empty sample set) is caught and written to
   * `convention_scans` as `status: 'failed'` so the row is never left stuck on
   * `queued`/`running`.
   */
  async executeScan(workspaceId: string, repoId: string): Promise<void> {
    const startedAt = new Date();
    try {
      await this.deps.repo.upsertScanState(repoId, { status: 'running', startedAt, error: null });

      const clonePath = await this.deps.repo.getRepoClonePath(repoId);
      if (!clonePath) {
        throw new Error('Repo has not been cloned yet — cannot scan for conventions.');
      }

      // 1. Sample selection: top-N ranked SOURCE files (capped) + the repo's
      // config files (eslint/prettier/tsconfig/editorconfig/biome).
      const samplePaths = await this.deps.repoIntel.getConventionSamples(repoId, RANK_SAMPLE_COUNT);

      const sampleFiles: { path: string; content: string }[] = [];
      for (const path of samplePaths.slice(0, RANK_SAMPLE_COUNT)) {
        const content = await readCloneFile(clonePath, path);
        if (content != null) sampleFiles.push({ path, content });
      }
      sampleFiles.push(...(await readConfigSamples(clonePath, samplePaths)));

      if (sampleFiles.length === 0) {
        await this.deps.repo.replacePendingCandidates(workspaceId, repoId, []);
        await this.deps.repo.upsertScanState(repoId, {
          status: 'done',
          sampledFileCount: 0,
          candidateCount: 0,
          finishedAt: new Date(),
        });
        return;
      }

      // 2. Lint/formatter awareness.
      const lintConfigNote = await detectLintConfig(clonePath);

      // 3. Batched extraction — chunk into EXTRACTION_BATCH_SIZE-file
      // batches, run in waves of EXTRACTION_CONCURRENCY.
      const { provider, model } = await this.deps.resolveModel(workspaceId);
      const llm = await this.deps.llm(provider);
      const sessionId = `conventions-scan-${repoId}-${startedAt.getTime()}`;

      const batches: { path: string; content: string }[][] = [];
      for (let i = 0; i < sampleFiles.length; i += EXTRACTION_BATCH_SIZE) {
        batches.push(sampleFiles.slice(i, i + EXTRACTION_BATCH_SIZE));
      }

      const rawCandidates: RawConventionCandidate[] = [];
      for (let i = 0; i < batches.length; i += EXTRACTION_CONCURRENCY) {
        const wave = batches.slice(i, i + EXTRACTION_CONCURRENCY);
        const outcomes = await Promise.all(
          wave.map((batchFiles) =>
            scanConventionsBatch({
              systemPrompt: DEFAULT_CONVENTION_SCAN_SYSTEM_PROMPT,
              model,
              sampleFiles: batchFiles,
              ...(lintConfigNote ? { lintConfigNote } : {}),
              llm,
              sessionId,
            }),
          ),
        );
        for (const outcome of outcomes) rawCandidates.push(...outcome.candidates);
      }

      // 4. Cross-batch dedup/merge — deterministic cluster pass, then one LLM merge pass.
      const clusters = clusterCandidatesByRuleSimilarity(rawCandidates);
      const merged = await mergeConventionCandidates({ clusters, llm, model, sessionId });

      // 5. Verification pass against a held-out pool NOT used as any merged
      // candidate's own evidence (fall back to reusing evidence files when
      // the sample set is too small to fill the pool otherwise).
      const evidencePaths = new Set(merged.flatMap((c) => c.evidence.map((e) => e.path)));
      const nonEvidenceFiles = sampleFiles.filter((f) => !evidencePaths.has(f.path));
      const evidenceFilesOnly = sampleFiles.filter((f) => evidencePaths.has(f.path));
      const heldOutFiles = [...nonEvidenceFiles, ...evidenceFilesOnly].slice(
        0,
        VERIFICATION_HELD_OUT_POOL_SIZE,
      );

      // reviewer-core's verifyConventions returns exactly one result per
      // input candidate, in the SAME order (it does its own id-matching
      // internally and defensive-fills a missing id — see
      // reviewer-core/src/review/verify-conventions.ts), so zipping by array
      // index against `merged` is safe and exact, not an approximation.
      const verifications = await verifyConventions({ candidates: merged, heldOutFiles, llm, model, sessionId });

      // 6. Confidence = computed, not self-reported. Drop anything below the
      // floor or verdict 'file_local' before it ever reaches grounding/persist.
      const survivors: { candidate: MergedCandidate; confidence: number }[] = [];
      for (let i = 0; i < merged.length; i++) {
        const candidate = merged[i]!;
        const verification = verifications[i]!;
        const confidence = computeConfidence({
          meanLlmConfidence: candidate.meanLlmConfidence,
          corroboratingFileCount: candidate.corroboratingFileCount,
          verificationVerdict: verification.verdict,
          confirmedHeldOutFileCount: verification.confirmed_in_files.length,
        });
        if (confidence < CONFIDENCE_FLOOR || verification.verdict === 'file_local') continue;
        survivors.push({ candidate, confidence });
      }

      // 7. Grounding gate — citation must be real, in-range, and verbatim.
      const sampleFilesByPath: Record<string, string> = {};
      for (const f of sampleFiles) sampleFilesByPath[f.path] = f.content;
      const grounding = groundConventionCandidates(
        survivors.map((s) => s.candidate),
        sampleFilesByPath,
      );
      const keptIds = new Set(grounding.kept.map((c) => c.id));
      const finalRows: NewConventionRow[] = survivors
        .filter((s) => keptIds.has(s.candidate.id))
        .map((s) => mergedCandidateToRow(s.candidate, s.confidence, workspaceId, repoId));

      // 8. Persist — rescan wipes only pending rows; accepted/rejected survive.
      await this.deps.repo.replacePendingCandidates(workspaceId, repoId, finalRows);
      await this.deps.repo.upsertScanState(repoId, {
        status: 'done',
        sampledFileCount: sampleFiles.length,
        candidateCount: finalRows.length,
        finishedAt: new Date(),
      });
    } catch (err) {
      // 9. Never leave the status row stuck on queued/running.
      await this.deps.repo.upsertScanState(repoId, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      });
    }
  }

  async setCandidateStatus(
    workspaceId: string,
    repoId: string,
    id: string,
    status: ConventionCandidateStatus,
  ): Promise<ConventionCandidate> {
    return this.editCandidate(workspaceId, repoId, id, { status });
  }

  async editCandidate(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: UpdateConventionCandidatePatch,
  ): Promise<ConventionCandidate> {
    const updated = await this.deps.repo.updateCandidate(workspaceId, repoId, id, patch);
    if (!updated) throw new NotFoundError('Convention candidate not found');
    return updated;
  }

  /**
   * Merge every currently-`accepted` candidate's evidence files into a new
   * Skill (`type: 'convention'`, `source: 'extracted'`). The server never
   * generates the markdown body — the client sends exactly what the user saw
   * and approved in the Create-skill modal.
   */
  async createSkillFromAccepted(
    workspaceId: string,
    repoId: string,
    input: CreateSkillFromAcceptedInput,
  ): Promise<Skill> {
    if (input.agent_id) {
      // Validate BEFORE creating the skill so a bad agent id never leaves an orphan skill.
      const linker = this.deps.agentLinker;
      if (!linker || !(await linker.hasAgent(workspaceId, input.agent_id))) {
        throw new NotFoundError('Agent not found');
      }
    }
    const evidenceFiles = await this.deps.repo.getAcceptedWithFiles(workspaceId, repoId);
    const skill = await this.deps.skills.create(workspaceId, {
      name: input.name,
      type: input.type ?? 'convention',
      body: input.body,
      source: 'extracted',
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      evidence_files: evidenceFiles,
    });
    if (input.agent_id) await this.deps.agentLinker!.appendSkill(input.agent_id, skill.id);
    return { ...skill, agent_count: input.agent_id ? skill.agent_count + 1 : skill.agent_count };
  }
}
