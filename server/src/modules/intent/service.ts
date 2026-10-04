import type {
  FeatureModelChoice,
  IntentSource,
  IntentSourceKind,
  LLMProvider,
  PrIntentRecord,
  Provider,
} from '@devdigest/shared';
import { classifyIntent, type IntentDocument, type IntentPromptInput } from '@devdigest/reviewer-core';
import { NotFoundError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import type {
  DocFetcher,
  IntentGitHubPort,
  IntentGitPort,
  IntentLogPort,
  IntentRepositoryPort,
  IntentStdLogger,
} from './ports.js';
import {
  MAX_COMMIT_SUBJECTS,
  MAX_PATHS,
  computeInputsHash,
  confidenceLevel,
  extractDocLinks,
  extractIssueRefs,
  extractTicketKeys,
  finaliseIntent,
  hasUnfetchedSpec,
  type DocLink,
} from './domain.js';
import { INTENT_TIMEOUT_MS } from './constants.js';

/**
 * IntentService — derives what a PR is meant to do, before it is reviewed.
 *
 * title / description / linked issues / plan-spec docs (indirect signals as the
 * fallback) → a cheap classifier model chosen in Settings → domain post-processing
 * → one `pr_intent` row. Best-effort by design: callers treat a failure as "review
 * without intent". Depends on ports only (never `Container`).
 */

export interface IntentServiceDeps {
  repo: IntentRepositoryPort;
  /** Resolves lazily: throws ConfigError when no GitHub token is set (we then degrade to DB data). */
  github: () => Promise<IntentGitHubPort>;
  git: IntentGitPort;
  docs: DocFetcher;
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** The workspace's chosen (or default) model for the 'review_intent' feature. */
  resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>;
}

export interface DeriveContext {
  force?: boolean;
  /** Live Log sink (a RunLogger). Omit for the on-demand route. */
  log?: IntentLogPort;
  /** pino logger — the only place cost is reported. */
  logger?: IntentStdLogger;
  /** Id shared with the review trigger's agent runs; logged on every pino line. */
  correlationId?: string;
}

export interface DeriveResult {
  record: PrIntentRecord;
  cached: boolean;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

const ZERO = { tokensIn: 0, tokensOut: 0 };

export class IntentService {
  constructor(private readonly deps: IntentServiceDeps) {}

  /** Read the persisted intent; never derives. */
  async get(workspaceId: string, prId: string): Promise<PrIntentRecord> {
    const row = await this.deps.repo.getIntent(workspaceId, prId);
    if (!row) throw new NotFoundError('Intent not derived for this pull request');
    const { inputs_hash: _hash, ...record } = row;
    return record;
  }

  async derive(workspaceId: string, prId: string, ctx: DeriveContext = {}): Promise<DeriveResult> {
    const started = Date.now();
    try {
      return await withTimeout(this.deriveInner(workspaceId, prId, ctx, started), INTENT_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof TimeoutError) {
        ctx.logger?.warn({ correlation_id: ctx.correlationId, prId, timeoutMs: INTENT_TIMEOUT_MS }, 'intent: derive timed out');
      }
      throw err;
    }
  }

  private async deriveInner(
    workspaceId: string,
    prId: string,
    ctx: DeriveContext,
    started: number,
  ): Promise<DeriveResult> {
    const { repo } = this.deps;
    const pull = await repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoInfo = await repo.getRepo(pull.repoId);
    if (!repoInfo) throw new NotFoundError('Repo not found');
    const fullName = `${repoInfo.owner}/${repoInfo.name}`;

    const [commitSubjects, files, model] = await Promise.all([
      repo.listCommitSubjects(prId).then((xs) => xs.slice(0, MAX_COMMIT_SUBJECTS)),
      repo.listFiles(prId).then((xs) => xs.slice(0, MAX_PATHS)),
      this.deps.resolveModel(workspaceId),
    ]);

    const paths = files.map((f) => f.path);

    // ---- cache: DB-held inputs + model only (live issue/doc content is not in the key)
    const inputsHash = computeInputsHash({
      title: pull.title,
      branch: pull.branch,
      body: pull.body ?? '',
      headSha: pull.headSha,
      commitSubjects,
      paths,
      provider: model.provider,
      model: model.model,
    });
    const existing = await repo.getIntent(workspaceId, prId);
    if (!ctx.force && existing && existing.inputs_hash === inputsHash) {
      const { inputs_hash: _h, ...record } = existing;
      const durationMs = Date.now() - started;
      this.report(ctx, record, { cached: true, ...ZERO, durationMs, model: model.model });
      return { record: { ...record, cached: true }, cached: true, ...ZERO, durationMs };
    }

    // ---- live data (best-effort; every failure degrades to what the DB holds)
    const live = await this.loadLive(repoInfo, pull.number);
    const description = (live.body ?? pull.body ?? '').trim();
    const labels = live.labels;

    const gathered = await this.gatherSources({
      repoInfo,
      fullName,
      number: pull.number,
      title: pull.title,
      branch: pull.branch,
      description,
      commitSubjects,
      paths,
      labels,
      github: live.github,
    });

    // ---- classify
    const llm = await this.deps.llm(model.provider);
    const t0 = Date.now();
    const out = await classifyIntent({
      llm,
      model: model.model,
      sessionId: `${fullName}#${pull.number}:intent`,
      inputs: {
        title: pull.title,
        branch: pull.branch,
        author: pull.author,
        description,
        commits: commitSubjects,
        files,
        labels,
        documents: gathered.documents,
        sourceIds: gathered.sourceIds,
      },
    });
    // Metadata only: section names + sizes + token counts + which sources fed it. No text,
    // no hunk headers, no URLs, no secrets.
    ctx.logger?.info(
      {
        event: 'intent.prompt.assembled',
        correlation_id: ctx.correlationId,
        prId,
        provider: model.provider,
        model: model.model,
        sections: out.promptSections.map((p) => ({ ...p, tokens_est: Math.ceil(p.chars / 4) })),
        total_chars: out.promptSections.reduce((n, p) => n + p.chars, 0),
        sources: gathered.sources.map((s) => ({ id: s.id, kind: s.kind, fetched: s.fetched })),
        files: files.length,
        hunk_headers: files.reduce((n, f) => n + f.hunks.length, 0),
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
        costUsd: out.costUsd,
        ms: Date.now() - t0,
      },
      'intent: classifier call finished',
    );

    // ---- domain post-processing, then persist
    const final = finaliseIntent(out.classification, gathered.sources);
    await repo.upsertIntent({
      prId,
      intent: final.intent,
      inScope: final.in_scope,
      outOfScope: final.out_of_scope,
      changeType: final.change_type,
      confidence: final.confidence,
      basis: final.basis,
      sources: final.sources,
      requirements: final.requirements,
      provider: model.provider,
      model: model.model,
      headSha: pull.headSha,
      inputsHash,
    });
    const saved = await this.get(workspaceId, prId);
    const durationMs = Date.now() - started;
    this.report(ctx, saved, {
      cached: false,
      tokensIn: out.tokensIn,
      tokensOut: out.tokensOut,
      durationMs,
      model: model.model,
    });
    return {
      record: { ...saved, cached: false },
      cached: false,
      tokensIn: out.tokensIn,
      tokensOut: out.tokensOut,
      durationMs,
    };
  }

  private async loadLive(
    repoInfo: { owner: string; name: string },
    number: number,
  ): Promise<{ body: string | null; labels: string[]; github: IntentGitHubPort | null }> {
    try {
      const github = await this.deps.github();
      const detail = await github.getPullRequest(repoInfo, number);
      return { body: detail.body ?? null, labels: detail.labels ?? [], github };
    } catch {
      return { body: null, labels: [], github: null };
    }
  }

  private async gatherSources(a: {
    repoInfo: { owner: string; name: string };
    fullName: string;
    number: number;
    title: string;
    branch: string;
    description: string;
    commitSubjects: string[];
    paths: string[];
    labels: string[];
    github: IntentGitHubPort | null;
  }): Promise<{
    sources: IntentSource[];
    documents: IntentDocument[];
    sourceIds: NonNullable<IntentPromptInput['sourceIds']>;
  }> {
    const sources: IntentSource[] = [];
    const documents: IntentDocument[] = [];
    const counters = new Map<IntentSourceKind, number>();
    const idFor = (kind: IntentSourceKind) => {
      const n = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, n);
      return `${kind}-${n}`;
    };
    const addSource = (kind: IntentSourceKind, ref: string, fetched: boolean, note?: string) => {
      const id = idFor(kind);
      sources.push({ id, kind, ref, fetched, ...(note ? { note } : {}) });
      return id;
    };

    const sourceIds: NonNullable<IntentPromptInput['sourceIds']> = {};
    sourceIds.title = addSource('title', 'PR title', true);
    if (a.description) sourceIds.description = addSource('description', 'PR description', true);
    sourceIds.branch = addSource('branch', 'head branch', true);
    if (a.commitSubjects.length > 0) {
      sourceIds.commits = addSource('commits', `${a.commitSubjects.length} commit subject(s)`, true);
    }
    if (a.paths.length > 0) sourceIds.files = addSource('files', `${a.paths.length} changed path(s)`, true);
    if (a.labels.length > 0) sourceIds.label = addSource('label', `${a.labels.length} label(s)`, true);

    // linked issues (same repo, capped), fetched through the GitHub port
    for (const n of extractIssueRefs(a.description, a.fullName, a.number)) {
      const ref = `#${n}`;
      if (!a.github) {
        addSource('issue', ref, false, 'GitHub not available');
        continue;
      }
      try {
        const issue = await a.github.getIssue(a.repoInfo, n);
        const id = addSource('issue', ref, true);
        documents.push({
          id,
          kind: 'issue',
          ref,
          fetched: true,
          content: `${issue.title}\n\n${issue.body ?? ''}`,
        });
      } catch {
        addSource('issue', ref, false, 'could not be fetched');
      }
    }

    // ticket keys are only listed
    for (const key of extractTicketKeys(`${a.title}\n${a.branch}\n${a.description}`)) {
      addSource('ticket', key, false, 'ticket systems are not fetched');
    }

    // plan / spec documents
    for (const link of extractDocLinks(a.description, a.fullName)) {
      const doc = await this.resolveDoc(link, a.repoInfo);
      const id = addSource(link.kind, link.ref, doc.fetched, doc.note);
      documents.push({
        id,
        kind: link.kind,
        ref: link.ref,
        fetched: doc.fetched,
        ...(doc.content !== undefined ? { content: doc.content } : {}),
      });
    }
    return { sources, documents, sourceIds };
  }

  private async resolveDoc(
    link: DocLink,
    repoInfo: { owner: string; name: string },
  ): Promise<{ fetched: boolean; content?: string; note?: string }> {
    try {
      if (link.via === 'repo') {
        return { fetched: true, content: await this.deps.git.readFile(repoInfo, link.path) };
      }
      if (link.via === 'http') {
        const res = await this.deps.docs.fetch(link.url);
        return { fetched: true, content: res.content };
      }
      return { fetched: false, note: 'external host is not fetched' };
    } catch {
      return { fetched: false, note: 'could not be read' };
    }
  }

  /** One Live Log line + the spec-conformance warning. Never logs bodies, doc contents or URL queries. */
  private report(
    ctx: DeriveContext,
    r: PrIntentRecord,
    m: { cached: boolean; tokensIn: number; tokensOut: number; durationMs: number; model: string },
  ): void {
    const sources = r.sources ?? [];
    const level = confidenceLevel(r.confidence ?? 0);
    const fetchedCount = sources.filter((s) => s.fetched).length;
    ctx.log?.result(
      `Intent: basis=${r.basis}, confidence=${level} (${(r.confidence ?? 0).toFixed(2)}), ` +
        `type=${r.change_type}, sources=${sources.length} (${fetchedCount} fetched), ` +
        `model=${m.model}, cached=${m.cached}, tokens=${m.tokensIn}/${m.tokensOut}`,
    );
    if (hasUnfetchedSpec(sources)) {
      ctx.log?.info('spec not fetched, conformance not verified');
    }
    ctx.logger?.info(
      {
        correlation_id: ctx.correlationId,
        prId: r.pr_id,
        basis: r.basis,
        level,
        confidence: r.confidence,
        changeType: r.change_type,
        sourceCount: sources.length,
        fetchedCount,
        model: m.model,
        cached: m.cached,
        tokensIn: m.tokensIn,
        tokensOut: m.tokensOut,
        ms: m.durationMs,
      },
      'intent: derived',
    );
  }
}
