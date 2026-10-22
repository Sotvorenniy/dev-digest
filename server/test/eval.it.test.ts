/**
 * SPEC-06 eval pipeline against real Postgres: case creation from decided findings, run
 * start/guards, per-case isolation, boot reaping, rate limits, cascade and prompt sensitivity.
 * Gated on Docker like the other integration tests; `EVAL_REQUIRE_DOCKER=1` (verify:l06) turns the
 * silent skip into a failure.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeStubRepoIntel } from './helpers/repo-intel-stub.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { EvalCase, EvalSetRun, EvalSetRunDetail } from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
if (process.env.EVAL_REQUIRE_DOCKER === '1' && !hasDocker) throw new Error('verify:l06 needs Docker');
const d = hasDocker ? describe : describe.skip;

const config = (env: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv);

const PATCH = '@@ -8,3 +8,4 @@\n a\n b\n+c\n d';
const NO_DOCS = {
  roots: [],
  scan: async () => ({ kind: 'clone_unavailable' as const }),
  read: async () => ({ kind: 'missing' as const }),
  exists: async () => 'missing' as const,
};

/** Fake provider: counts calls; optionally fails; with `promptSensitive` only a STRICT prompt finds the bug. */
function fakeLlm(opts: { promptSensitive?: boolean } = {}) {
  const state = { calls: 0, fail: false };
  const provider = {
    id: 'openrouter',
    completeStructured: async (req: { messages: { role: string; content: string }[] }) => {
      state.calls++;
      if (state.fail) throw new Error('502 bad gateway');
      const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const finds = opts.promptSensitive ? system.includes('STRICT-MODE') : true;
      return {
        data: {
          verdict: 'comment',
          summary: 's',
          score: 70,
          findings: finds
            ? [
                {
                  id: 'f',
                  severity: 'CRITICAL',
                  category: 'security',
                  title: 'Found it',
                  file: 'src/a.ts',
                  start_line: 10,
                  end_line: 10,
                  rationale: 'r',
                  confidence: 0.9,
                },
              ]
            : [],
        },
        raw: '',
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.001,
        model: 'm',
      };
    },
  } as unknown as LLMProvider;
  return { state, provider };
}

d('eval pipeline (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const db = () => pg.handle.db;

  async function makeAgent(prompt = 'You are a reviewer.') {
    const [a] = await db()
      .insert(t.agents)
      .values({
        workspaceId,
        name: `eval-agent-${seq++}`,
        provider: 'openrouter',
        model: 'm/x',
        systemPrompt: prompt,
        enabled: true,
        version: 1,
      })
      .returning();
    return a!;
  }

  /** PR + one file with PATCH + a review (optionally agent-owned) + one finding at src/a.ts:10. */
  async function makeFinding(
    opts: { agentId?: string | null; decision?: 'accept' | 'dismiss' | null; patch?: string | null; file?: string } = {},
  ) {
    const name = `eval-${seq++}`;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'My <b>PR</b> title',
        author: 'a',
        branch: 'feat/x',
        base: 'main',
        headSha: 'sha',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
        body: 'PR body',
      })
      .returning();
    const file = opts.file ?? 'src/a.ts';
    if (opts.patch !== null) {
      await db().insert(t.prFiles).values({ prId: pr!.id, path: file, additions: 1, deletions: 0, patch: opts.patch ?? PATCH });
    }
    const [review] = await db()
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId: opts.agentId ?? null, kind: 'review', verdict: 'comment', summary: 's', score: 70, model: 'm' })
      .returning();
    const now = new Date();
    const [finding] = await db()
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file,
        startLine: 10,
        endLine: 10,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Real bug',
        rationale: 'r',
        confidence: 0.9,
        acceptedAt: opts.decision === 'accept' ? now : null,
        dismissedAt: opts.decision === 'dismiss' ? now : null,
      })
      .returning();
    return { pr: pr!, finding: finding! };
  }

  const makeApp = async (llm = fakeLlm(), env: Record<string, string> = {}) => ({
    llm,
    app: await buildApp({
      config: config(env),
      db: pg.handle.db,
      overrides: {
        llm: { openrouter: llm.provider, openai: llm.provider, anthropic: llm.provider },
        github: new MockGitHubClient(),
        repoIntel: makeStubRepoIntel([]),
        projectDocs: NO_DOCS as never,
      },
    }),
  });
  type App = Awaited<ReturnType<typeof makeApp>>['app'];

  // Default body is `{}` so the pipeline tests exercise behaviour independent of the empty-body
  // defect covered by its own test below ("an empty-body POST ...").
  const post = (a: App, url: string, payload: unknown = {}) =>
    a.inject({ method: 'POST', url, payload: payload as object });

  const runCount = async (agentId: string) =>
    (await db().select().from(t.evalSetRuns).where(eq(t.evalSetRuns.agentId, agentId))).length;

  async function runAndWait(a: App, agentId: string): Promise<EvalSetRunDetail> {
    const res = await post(a, `/agents/${agentId}/eval-runs`);
    expect(res.statusCode).toBe(202);
    const id = EvalSetRun.parse(res.json()).id;
    for (let i = 0; i < 100; i++) {
      const got = await a.inject({ method: 'GET', url: `/eval-runs/${id}` });
      const detail = EvalSetRunDetail.parse(got.json());
      if (detail.status !== 'running') return detail;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('run did not settle');
  }

  async function caseFor(a: App, agentId: string, decision: 'accept' | 'dismiss' = 'accept') {
    const { finding } = await makeFinding({ agentId, decision });
    const res = await post(a, `/findings/${finding.id}/eval-case`);
    expect(res.statusCode, res.body).toBe(201);
    return { finding, evalCase: EvalCase.parse(res.json()) };
  }

  it('AC1/AC2: accepted -> must_find, dismissed -> must_not_flag, with source ids and the stored diff', async () => {
    const { app: a } = await makeApp();
    const agent = await makeAgent();
    const acc = await makeFinding({ agentId: agent.id, decision: 'accept' });
    const dis = await makeFinding({ agentId: agent.id, decision: 'dismiss' });

    const r1 = await post(a, `/findings/${acc.finding.id}/eval-case`);
    expect(r1.statusCode, r1.body).toBe(201);
    const c1 = EvalCase.parse(r1.json());
    expect(c1.expected_output.type).toBe('must_find');
    expect(c1.source_finding_id).toBe(acc.finding.id);
    expect(c1.owner_id).toBe(agent.id);
    expect(c1.input_diff).toBe(PATCH);
    expect(c1.input_files).toEqual(['src/a.ts']);
    expect(c1.input_meta).toEqual({ pr_number: 7, title: 'My <b>PR</b> title', body: 'PR body' });
    expect(c1.expected_output.items[0]).toMatchObject({ file: 'src/a.ts', start_line: 10, end_line: 10 });

    const r2 = await post(a, `/findings/${dis.finding.id}/eval-case`);
    expect(r2.statusCode).toBe(201);
    expect(EvalCase.parse(r2.json()).expected_output.type).toBe('must_not_flag');
  });

  it('AC4/AC5: an empty-body POST (what the client sends, with or without a JSON content-type) creates the case', async () => {
    const { app: a } = await makeApp();
    const agent = await makeAgent();
    const { finding } = await makeFinding({ agentId: agent.id, decision: 'accept' });
    const bare = await a.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(bare.statusCode, bare.body).toBe(201);
    const { finding: f2 } = await makeFinding({ agentId: agent.id, decision: 'accept' });
    const json = await a.inject({
      method: 'POST',
      url: `/findings/${f2.id}/eval-case`,
      headers: { 'content-type': 'application/json' },
    });
    expect(json.statusCode, json.body).toBe(201);
  });

  it('AC3: undecided finding -> 422 finding_undecided and no row', async () => {
    const { app: a } = await makeApp();
    const agent = await makeAgent();
    const { finding } = await makeFinding({ agentId: agent.id, decision: null });
    const res = await post(a, `/findings/${finding.id}/eval-case`);
    expect(res.statusCode).toBe(422);
    expect(res.body).toContain('finding_undecided');
    const rows = await db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id));
    expect(rows).toHaveLength(0);
  });

  it('EC2: a second POST answers 200 with the same id and leaves one row', async () => {
    const { app: a } = await makeApp();
    const agent = await makeAgent();
    const { finding, evalCase } = await caseFor(a, agent.id);
    const again = await post(a, `/findings/${finding.id}/eval-case`);
    expect(again.statusCode).toBe(200);
    expect(EvalCase.parse(again.json()).id).toBe(evalCase.id);
    const rows = await db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id));
    expect(rows).toHaveLength(1);
  });

  it('EC3: a missing patch -> 422 diff_unavailable; the seeded PR #482 users.ts finding is unavailable too', async () => {
    const { app: a } = await makeApp();
    const agent = await makeAgent();
    const { finding } = await makeFinding({ agentId: agent.id, decision: 'accept', patch: null });
    const res = await post(a, `/findings/${finding.id}/eval-case`);
    expect(res.statusCode).toBe(422);
    expect(res.body).toContain('diff_unavailable');

    const [seeded] = await db().select().from(t.findings).where(eq(t.findings.file, 'src/api/users.ts'));
    await db().update(t.findings).set({ acceptedAt: new Date() }).where(eq(t.findings.id, seeded!.id));
    const [any] = await db().select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    const seededRes = await post(a, `/findings/${seeded!.id}/eval-case`, { agent_id: any!.id });
    expect(seededRes.statusCode).toBe(422);
    expect(seededRes.body).toContain('diff_unavailable');
  });

  it('AC18: a review with no agent needs agent_id, and the picked agent owns the case', async () => {
    const { app: a } = await makeApp();
    const agent = await makeAgent();
    const { finding } = await makeFinding({ agentId: null, decision: 'accept' });
    const none = await post(a, `/findings/${finding.id}/eval-case`);
    expect(none.statusCode).toBe(422);
    expect(none.body).toContain('agent_required');
    const ok = await post(a, `/findings/${finding.id}/eval-case`, { agent_id: agent.id });
    expect(ok.statusCode).toBe(201);
    expect(EvalCase.parse(ok.json()).owner_id).toBe(agent.id);
  });

  it('AC8: delete -> 204, the case leaves the list, an older run keeps the case name', async () => {
    const { app: a } = await makeApp();
    const agent = await makeAgent();
    const { evalCase } = await caseFor(a, agent.id);
    const run = await runAndWait(a, agent.id);
    expect(run.results[0]!.case_name).toBe(evalCase.name);

    const del = await a.inject({ method: 'DELETE', url: `/eval-cases/${evalCase.id}` });
    expect(del.statusCode).toBe(204);
    const list = await a.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` });
    expect(list.json()).toEqual([]);
    const old = EvalSetRunDetail.parse((await a.inject({ method: 'GET', url: `/eval-runs/${run.id}` })).json());
    expect(old.results[0]!.case_name).toBe(evalCase.name);
    const again = await a.inject({ method: 'DELETE', url: `/eval-cases/${evalCase.id}` });
    expect(again.statusCode).toBe(404);
  });

  it('AC5/AC6/NFR1: start answers 202 running; calls equal cases (1 chunk each); the run is scored', async () => {
    const llm = fakeLlm();
    const { app: a } = await makeApp(llm);
    const agent = await makeAgent();
    await caseFor(a, agent.id, 'accept');
    await caseFor(a, agent.id, 'dismiss');

    const res = await post(a, `/agents/${agent.id}/eval-runs`);
    expect(res.statusCode).toBe(202);
    const started = EvalSetRun.parse(res.json());
    expect(started).toMatchObject({ status: 'running', agent_version: 1, model: 'm/x', cases_total: 2 });
    let detail = started as EvalSetRunDetail | EvalSetRun;
    for (let i = 0; i < 100 && detail.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 50));
      detail = EvalSetRunDetail.parse((await a.inject({ method: 'GET', url: `/eval-runs/${started.id}` })).json());
    }
    expect(detail.status).toBe('done');
    expect(llm.state.calls).toBe(2);
    // must_find case found the bug; the must_not_flag case flagged it -> one pass, one fail.
    expect(detail.cases_passed).toBe(1);
    expect(detail.recall).toBe(1);
    expect(detail.finished_at).not.toBeNull();
    const hist = await a.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` });
    expect((hist.json() as unknown[]).length).toBe(1);
  });

  it('AC9: running twice -> 409 eval_run_active with an unchanged run count', async () => {
    const { app: a } = await makeApp();
    const agent = await makeAgent();
    await caseFor(a, agent.id);
    await db().insert(t.evalSetRuns).values({
      workspaceId,
      agentId: agent.id,
      agentVersion: 1,
      provider: 'openrouter',
      model: 'm/x',
      strategy: 'auto',
      systemPrompt: 'p',
      status: 'running',
      caseSet: [],
    });
    const res = await post(a, `/agents/${agent.id}/eval-runs`);
    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('eval_run_active');
    expect(await runCount(agent.id)).toBe(1);
  });

  it('AC10: no cases -> 422 no_eval_cases; no key -> 422 provider_not_configured; unknown agent -> 404', async () => {
    const { app: a } = await makeApp();
    const empty = await makeAgent();
    const r1 = await post(a, `/agents/${empty.id}/eval-runs`);
    expect(r1.statusCode).toBe(422);
    expect(r1.body).toContain('no_eval_cases');
    expect(await runCount(empty.id)).toBe(0);

    const keyless = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider({}),
        github: new MockGitHubClient(),
        repoIntel: makeStubRepoIntel([]),
        projectDocs: NO_DOCS as never,
      },
    });
    const agent = await makeAgent();
    await caseFor(a, agent.id);
    const r2 = await post(keyless, `/agents/${agent.id}/eval-runs`);
    expect(r2.statusCode).toBe(422);
    expect(r2.body).toContain('provider_not_configured');
    expect(await runCount(agent.id)).toBe(0);

    const r3 = await post(a, `/agents/00000000-0000-4000-8000-000000000000/eval-runs`);
    expect(r3.statusCode).toBe(404);
  });

  it('AC13: a failing provider -> a partial/failed run with cases_errored and error text on the results', async () => {
    const llm = fakeLlm();
    const { app: a } = await makeApp(llm);
    const agent = await makeAgent();
    await caseFor(a, agent.id);
    await caseFor(a, agent.id);
    llm.state.fail = true;
    const failed = await runAndWait(a, agent.id);
    expect(failed.status).toBe('failed');
    expect(failed.cases_errored).toBe(2);
    expect(failed.recall).toBeNull();
    expect(failed.results.every((r) => r.status === 'error' && r.error)).toBe(true);
  });

  it('NFR8: a stale running row is failed on the next boot (finished_at + error set) and a new start works', async () => {
    const { app: a } = await makeApp();
    const agent = await makeAgent();
    await caseFor(a, agent.id);
    const [row] = await db()
      .insert(t.evalSetRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        agentVersion: 1,
        provider: 'openrouter',
        model: 'm/x',
        strategy: 'auto',
        systemPrompt: 'p',
        status: 'running',
        caseSet: [],
      })
      .returning();
    const { app: reboot } = await makeApp();
    const [after] = await db().select().from(t.evalSetRuns).where(eq(t.evalSetRuns.id, row!.id));
    expect(after!.status).toBe('failed');
    expect(after!.finishedAt).not.toBeNull();
    expect(after!.error).toBeTruthy();
    const next = await runAndWait(reboot, agent.id);
    expect(next.status).toBe('done');
  });

  it('NFR2: dev-mode app answers 429 on the 11th run start; the 11th eval-case POST is not 429', async () => {
    const { app: a } = await makeApp(fakeLlm(), { NODE_ENV: 'development' });
    const agent = await makeAgent(); // no cases -> every start is a cheap 422, still counted
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await post(a, `/agents/${agent.id}/eval-runs`)).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 422)).toBe(true);
    expect(codes[10]).toBe(429);

    const { finding } = await makeFinding({ agentId: agent.id, decision: null });
    const eleven: number[] = [];
    for (let i = 0; i < 11; i++) eleven.push((await post(a, `/findings/${finding.id}/eval-case`)).statusCode);
    expect(eleven[10]).not.toBe(429);
  });

  it('AC19: deleting the agent removes its eval cases and set runs', async () => {
    const { app: a } = await makeApp();
    const agent = await makeAgent();
    await caseFor(a, agent.id);
    await runAndWait(a, agent.id);
    const del = await a.inject({ method: 'DELETE', url: `/agents/${agent.id}` });
    expect(del.statusCode).toBe(200);
    const cases = await db().select().from(t.evalCases).where(eq(t.evalCases.ownerId, agent.id));
    const runs = await db().select().from(t.evalSetRuns).where(eq(t.evalSetRuns.agentId, agent.id));
    expect(cases).toHaveLength(0);
    expect(runs).toHaveLength(0);
  });

  it('AC17: changing the system prompt changes the scored metrics between two runs', async () => {
    const { app: a } = await makeApp(fakeLlm({ promptSensitive: true }));
    const agent = await makeAgent('You are lax.');
    await caseFor(a, agent.id, 'accept');
    const first = await runAndWait(a, agent.id);
    expect(first.recall).toBe(0);

    const put = await a.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'You are STRICT-MODE.' } });
    expect(put.statusCode).toBe(200);
    const second = await runAndWait(a, agent.id);
    expect(second.recall).toBe(1);
    expect(second.agent_version).toBeGreaterThan(first.agent_version);
    expect(second.system_prompt).toContain('STRICT-MODE');
    expect(first.system_prompt).toBe('You are lax.');
  });

  it('keeps jsonb results parseable after the raw row round-trips', async () => {
    const { app: a } = await makeApp();
    const agent = await makeAgent();
    await caseFor(a, agent.id);
    const run = await runAndWait(a, agent.id);
    const raw = (await db().execute(sql`select results::text as r from eval_set_runs where id = ${run.id}`))[0]!.r as string;
    expect(JSON.parse(raw)).toHaveLength(1);
  });
});
