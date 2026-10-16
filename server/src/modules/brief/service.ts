import type {
  BlastRadius,
  FeatureModelChoice,
  LLMProvider,
  PrBrief,
  PrIntentRecord,
  Provider,
} from '@devdigest/shared';
import { ConfigError, NotFoundError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import type { DocRead } from '../../ports/project-docs.js';
import { buildProjectContext, orderCandidates } from '../project-context/domain.js';
import type {
  BriefBlastPort,
  BriefDocsPort,
  BriefFileRow,
  BriefIntentPort,
  BriefIssuePort,
  BriefLogPort,
  BriefPull,
  BriefRepositoryPort,
} from './ports.js';
import {
  briefGenerationError,
  buildPromptFiles,
  capCallerPaths,
  classifyLlmFailure,
  computeMissingInputs,
  groundBrief,
  linkedIssueNumber,
  noFilesError,
  type MissingInputsArgs,
} from './domain.js';
import { BRIEF_ISSUE_TIMEOUT_MS, BRIEF_LLM_TIMEOUT_MS, BRIEF_MAX_OUTPUT_TOKENS } from './constants.js';
import { BriefModelOutput, assembleBriefPrompt, type BriefFacts } from './prompt.js';

/**
 * BriefService — reads the stored brief (never generates on GET) and generates one
 * with exactly one LLM call. Depends on ports only (never `Container`). The in-flight
 * map is in-memory: it lives on the memoized instance.
 */

export interface BriefServiceDeps {
  repo: BriefRepositoryPort;
  intent: BriefIntentPort;
  blast: BriefBlastPort;
  issues: BriefIssuePort;
  docs: BriefDocsPort;
  /** A provider that makes exactly one HTTP request per structured call. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
  systemPrompt: () => Promise<string>;
  now?: () => Date;
  limits?: Partial<{ llmTimeoutMs: number; issueTimeoutMs: number }>;
}

/** What `gatherFacts` hands to the prompt and to the stored brief. */
interface GatheredFacts {
  facts: BriefFacts;
  intentRecord: (PrIntentRecord & { inputs_hash: string | null }) | undefined;
  blast: BlastRadius | null;
  callerPaths: Set<string> | null;
  /** Missing-input args known before the prompt decides which specs fit. */
  missingInputsArgs: Omit<MissingInputsArgs, 'specsIncluded'>;
  /** Cuts made while gathering (files over 300, callers over 100, summary cut). */
  truncatedSoFar: { files: number; callers: number; blastSummary: boolean };
}

export class BriefService {
  /** prId → generation currently running (joined by concurrent requests). */
  private inFlight = new Map<string, Promise<PrBrief>>();
  /** Errors whose `brief.failed` line is already written. */
  private logged = new WeakSet<object>();

  constructor(private readonly deps: BriefServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrBrief> {
    const pull = await this.deps.repo.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const brief = await this.deps.repo.getBrief(prId);
    if (!brief) throw new NotFoundError('Brief not found');
    return brief;
  }

  async generate(workspaceId: string, prId: string, ctx: { logger: BriefLogPort }): Promise<PrBrief> {
    const pull = await this.deps.repo.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // No await between this check and the `set` below: two requests cannot both start a run.
    const existing = this.inFlight.get(prId);
    if (existing) return existing;

    const clear = (): void => {
      if (this.inFlight.get(prId) === running) this.inFlight.delete(prId);
    };
    const running: Promise<PrBrief> = this.run(workspaceId, pull, ctx.logger).finally(clear);
    this.inFlight.set(prId, running);
    return running;
  }

  private fail(log: BriefLogPort, prId: string, reason: string, err: Error): Error {
    log.warn({ event: 'brief.failed', pr_id: prId, reason });
    this.logged.add(err);
    return err;
  }

  private async run(workspaceId: string, pull: BriefPull, log: BriefLogPort): Promise<PrBrief> {
    const { repo } = this.deps;
    const started = Date.now();
    try {
      const files = await repo.listFiles(pull.id);
      if (files.length === 0) throw this.fail(log, pull.id, 'no_files', noFilesError());

      let choice: FeatureModelChoice;
      let llm: LLMProvider;
      try {
        choice = await this.deps.resolveModel(workspaceId);
        llm = await this.deps.llm(choice.provider);
      } catch (err) {
        if (err instanceof ConfigError) throw this.fail(log, pull.id, 'config_error', err);
        throw err;
      }

      const gathered = await this.gatherFacts(workspaceId, pull, files);
      const prompt = assembleBriefPrompt(gathered.facts, await this.deps.systemPrompt());
      const missing = computeMissingInputs({
        ...gathered.missingInputsArgs,
        specsIncluded: prompt.specsUsed.length,
      });

      const timeoutMs = this.deps.limits?.llmTimeoutMs ?? BRIEF_LLM_TIMEOUT_MS;
      let result: Awaited<ReturnType<LLMProvider['completeStructured']>> & { data: BriefModelOutput };
      try {
        result = (await withTimeout(
          llm.completeStructured({
            model: choice.model,
            schema: BriefModelOutput,
            schemaName: 'PrBrief',
            messages: prompt.messages,
            maxTokens: BRIEF_MAX_OUTPUT_TOKENS,
            timeoutMs,
            maxRetries: 0,
            temperature: 0,
          }),
          timeoutMs,
        )) as typeof result;
      } catch (err) {
        const reason = classifyLlmFailure(err);
        throw this.fail(log, pull.id, reason, briefGenerationError(reason));
      }

      const diff = await repo.getDiff(pull.id);
      const grounded = groundBrief(result.data, {
        diff,
        prPaths: new Set(files.map((f) => f.path)),
        callerPaths: gathered.callerPaths,
      });

      const truncated = {
        files: gathered.truncatedSoFar.files + prompt.truncated.files,
        description: prompt.truncated.description,
        issue_body: prompt.truncated.issueBody,
        callers: gathered.truncatedSoFar.callers + prompt.truncated.callers,
        blast_summary: gathered.truncatedSoFar.blastSummary,
      };
      const rec = gathered.intentRecord;
      const brief: PrBrief = {
        summary: result.data.summary,
        intent: rec ? { intent: rec.intent, in_scope: rec.in_scope, out_of_scope: rec.out_of_scope } : null,
        blast: gathered.blast,
        risks: { risks: grounded.risks },
        history: null,
        review_focus: grounded.reviewFocus,
        head_sha: pull.headSha,
        generated_at: (this.deps.now?.() ?? new Date()).toISOString(),
        missing_inputs: missing,
        specs_used: prompt.specsUsed,
        truncated,
        dropped: grounded.dropped,
        model: result.model || choice.model,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd,
      };
      await repo.saveBrief(pull.id, brief);

      // Counts, enums and cost only — never PR text or model output.
      log.info({
        event: 'brief.generated',
        pr_id: pull.id,
        llm_calls: 1,
        model: brief.model,
        tokens_in: brief.tokens_in,
        tokens_out: brief.tokens_out,
        cost_usd: brief.cost_usd,
        files_total: files.length,
        specs_used: prompt.specsUsed.length,
        risks: grounded.risks.length,
        review_focus: grounded.reviewFocus.length,
        missing_inputs: missing,
        truncated,
        dropped: grounded.dropped,
        duration_ms: Date.now() - started,
      });
      return brief;
    } catch (err) {
      if (typeof err === 'object' && err !== null && !this.logged.has(err)) {
        log.warn({ event: 'brief.failed', pr_id: pull.id, reason: 'internal' });
      }
      throw err;
    }
  }

  private async gatherFacts(
    workspaceId: string,
    pull: BriefPull,
    files: BriefFileRow[],
  ): Promise<GatheredFacts> {
    const { intent, blast, issues, docs, repo } = this.deps;
    const issueTimeoutMs = this.deps.limits?.issueTimeoutMs ?? BRIEF_ISSUE_TIMEOUT_MS;
    const repoRef = { owner: pull.repo.owner, name: pull.repo.name };

    const [intentRecord, blastRes, issue, agentPaths] = await Promise.all([
      intent.getIntent(workspaceId, pull.id),
      blast.get(workspaceId, pull.id).then(
        (b) => ({ value: b as BlastRadius | null, failed: false }),
        () => ({ value: null as BlastRadius | null, failed: true }),
      ),
      (async () => {
        const n = linkedIssueNumber(pull.body);
        if (n === null) return null;
        try {
          return await withTimeout(issues.getIssue(repoRef, n), issueTimeoutMs);
        } catch {
          return null;
        }
      })(),
      repo.listEnabledAgentDocPaths(workspaceId, pull.repoId),
    ]);

    const candidates = orderCandidates([...new Set(agentPaths)], []);
    const reads = new Map<string, DocRead>();
    await Promise.all(
      candidates.map(async (c) => {
        try {
          reads.set(c.path, await docs.read(repoRef, c.path));
        } catch {
          reads.set(c.path, { kind: 'missing' });
        }
      }),
    );
    const specs = buildProjectContext(candidates, reads).specs;

    const capped = capCallerPaths(blastRes.value);
    const built = buildPromptFiles(files);

    const facts: BriefFacts = {
      title: pull.title,
      description: pull.body,
      issue: issue ? { number: issue.number, title: issue.title, body: issue.body ?? null } : null,
      intent: intentRecord
        ? {
            intent: intentRecord.intent,
            in_scope: intentRecord.in_scope,
            out_of_scope: intentRecord.out_of_scope,
            change_type: intentRecord.change_type ?? 'other',
          }
        : null,
      blast: capped.summary !== null ? { summary: capped.summary, callerFiles: capped.callerFiles } : null,
      files: built.files,
      specs,
    };

    return {
      facts,
      intentRecord,
      blast: blastRes.value,
      callerPaths: blastRes.value ? new Set(capped.callerFiles) : null,
      missingInputsArgs: {
        intent: intentRecord ? { head_sha: intentRecord.head_sha } : null,
        prHeadSha: pull.headSha,
        blast: blastRes.value,
        blastFailed: blastRes.failed,
        description: pull.body,
        issue,
      },
      truncatedSoFar: {
        files: built.leftOut,
        callers: capped.callersLeftOut,
        blastSummary: capped.summaryCut,
      },
    };
  }
}
