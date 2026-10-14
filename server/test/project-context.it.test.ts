import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context] Docker not available — skipping integration tests.');
}

/**
 * SPEC-01 AC1, AC3, AC4, AC5, AC6, AC8, EC3, EC4, EC13, EC14, NFR4, NFR6.
 * The real container wiring: DEVDIGEST_CLONE_DIR points at a tmp dir, so the
 * seeded repo acme/payments-api resolves to <tmp>/acme/payments-api.
 */
d('project context routes', () => {
  let pg: PgFixture;
  let cloneDir: string;
  let app: FastifyInstance;
  let workspaceId: string;
  let repoId: string; // acme/payments-api, has a clone
  let noCloneRepoId: string; // acme/no-clone, no clone on disk
  let bigRepoId: string; // acme/big, 5,000 files

  const err = (res: { json: () => any }) => res.json().error;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    cloneDir = await mkdtemp(join(tmpdir(), 'pc-it-'));

    const [repo] = await pg.handle.db.select().from(t.repos);
    repoId = repo!.id;
    workspaceId = repo!.workspaceId;
    const extra = async (name: string) => {
      const [r] = await pg.handle.db
        .insert(t.repos)
        .values({
          workspaceId,
          owner: 'acme',
          name,
          fullName: `acme/${name}`,
          defaultBranch: 'main',
          clonePath: null,
        })
        .returning();
      return r!.id;
    };
    noCloneRepoId = await extra('no-clone');
    bigRepoId = await extra('big');

    const clone = join(cloneDir, 'acme', 'payments-api');
    const put = async (rel: string, body: string) => {
      await mkdir(join(clone, rel, '..'), { recursive: true });
      await writeFile(join(clone, rel), body);
    };
    await put('specs/a.md', '# Spec A\nalpha');
    await put('docs/b.md', '# Doc B\nbeta');
    await put('insights/c.md', '# Insight C\ngamma');
    await put('src/d.md', 'not a context doc');
    await put('docs/big.md', 'x'.repeat(65_537));
    await put('src/secret.md', 'SECRET');
    await mkdir(join(cloneDir, 'outside'), { recursive: true });
    await writeFile(join(cloneDir, 'outside', 'leak.md'), 'LEAK');
    await symlink(join(cloneDir, 'outside', 'leak.md'), join(clone, 'docs', 'leak-link.md'));
    await symlink(join(clone, 'src', 'secret.md'), join(clone, 'specs', 'secret-link.md'));

    const big = join(cloneDir, 'acme', 'big');
    await mkdir(join(big, 'docs'), { recursive: true });
    await mkdir(join(big, 'src'), { recursive: true });
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 5_000; i++) {
      const rel = i < 600 ? join('docs', `f${i}.md`) : join('src', `f${i}.ts`);
      writes.push(writeFile(join(big, rel), `# f${i}\nbody`));
    }
    await Promise.all(writes);

    const config = loadConfig({ ...process.env, NODE_ENV: 'test', DEVDIGEST_CLONE_DIR: cloneDir } as NodeJS.ProcessEnv);
    app = await buildApp({ config, db: pg.handle.db, overrides: { github: new MockGitHubClient() } });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  async function newAgent(name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number };
  }
  async function newSkill(name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, type: 'custom', body: 'skill body' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }
  const putAgent = (id: string, repo_id: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/agents/${id}/context`, payload: { repo_id, paths } });
  const getAgent = (id: string, repo_id: string) =>
    app.inject({ method: 'GET', url: `/agents/${id}/context?repo_id=${repo_id}` });
  const fileUrl = (id: string, path: string) => `/repos/${id}/context/file?path=${encodeURIComponent(path)}`;

  const BAD_PATHS = [
    '../x.md',
    'specs/../../etc/passwd.md',
    '/etc/x.md',
    'C:\\x.md',
    'specs/%2e%2e/x.md',
    'specs/a\u0000.md',
    'specs/a\n.md',
  ];

  describe('GET /repos/:id/context', () => {
    it('lists exactly the docs under the roots, sorted, with all fields (AC1, AC5)', async () => {
      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // symlinks are not listed, src/ is outside the roots
      expect(body.docs.map((x: { path: string }) => x.path)).toEqual([
        'docs/b.md',
        'docs/big.md',
        'insights/c.md',
        'specs/a.md',
      ]);
      expect(body.docs[0]).toMatchObject({ path: 'docs/b.md', type: 'docs', used_by_agents: 0 });
      expect(body.docs[0].size_bytes).toBe(12);
      expect(body.docs[0].tokens).toBe(3);
      expect(body.docs[0].updated_at).toMatch(/^\d{4}-/);
      expect(body.total_tokens).toBe(body.docs.reduce((n: number, x: { tokens: number }) => n + x.tokens, 0));
      expect(body.search_roots).toEqual(['**/{specs,docs,insights}/**/*.md']);
      expect(body.truncated).toBe(false);
    });

    it('unknown repo gives 404 repo_not_found', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/repos/00000000-0000-4000-8000-000000000000/context',
      });
      expect(res.statusCode).toBe(404);
      expect(err(res).code).toBe('repo_not_found');
    });

    it('a repo with no clone gives 409 clone_unavailable (EC3)', async () => {
      const res = await app.inject({ method: 'GET', url: `/repos/${noCloneRepoId}/context` });
      expect(res.statusCode).toBe(409);
      expect(err(res).code).toBe('clone_unavailable');
    });

    it('lists a 5,000-file clone in under 1 s, p95 over 20 calls (NFR6)', async () => {
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        const res = await app.inject({ method: 'GET', url: `/repos/${bigRepoId}/context` });
        times.push(performance.now() - t0);
        expect(res.statusCode).toBe(200);
        if (i === 0) {
          expect(res.json().docs).toHaveLength(500);
          expect(res.json().truncated).toBe(true);
        }
      }
      times.sort((a, b) => a - b);
      expect(times[18]!).toBeLessThan(1000);
    }, 60_000);
  });

  describe('GET /repos/:id/context/file', () => {
    it('returns the content and metadata (AC3)', async () => {
      const res = await app.inject({ method: 'GET', url: fileUrl(repoId, 'specs/a.md') });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        path: 'specs/a.md',
        type: 'specs',
        content: '# Spec A\nalpha',
        used_by_agents: 0,
      });
    });

    it('missing doc gives 404', async () => {
      const res = await app.inject({ method: 'GET', url: fileUrl(repoId, 'specs/none.md') });
      expect(res.statusCode).toBe(404);
      expect(err(res).code).toBe('context_doc_not_found');
    });

    it('a doc over 64 KB gives 413', async () => {
      const res = await app.inject({ method: 'GET', url: fileUrl(repoId, 'docs/big.md') });
      expect(res.statusCode).toBe(413);
      expect(err(res).code).toBe('context_doc_too_large');
    });

    it('no clone gives 409', async () => {
      const res = await app.inject({ method: 'GET', url: fileUrl(noCloneRepoId, 'specs/a.md') });
      expect(res.statusCode).toBe(409);
    });

    it.each(BAD_PATHS)('rejects traversal fixture %j with 400 context_path_invalid (NFR1)', async (p) => {
      const res = await app.inject({ method: 'GET', url: fileUrl(repoId, p) });
      expect(res.statusCode).toBe(400);
      expect(err(res).code).toBe('context_path_invalid');
    });

    it.each(['src/d.md', 'src/secret.md', 'specs/secret-link.md', 'docs/leak-link.md'])(
      'rejects %s: outside the roots or a symlink escape (AC5, EC7)',
      async (p) => {
        const res = await app.inject({ method: 'GET', url: fileUrl(repoId, p) });
        expect(res.statusCode).toBe(400);
        expect(err(res).code).toBe('context_path_invalid');
        expect(res.body).not.toContain('SECRET');
        expect(res.body).not.toContain('LEAK');
      },
    );
  });

  describe('attachments (agents)', () => {
    it('PUT then GET keeps the order, stores paths only and does not bump the agent version (AC6)', async () => {
      const agent = await newAgent('ctx-order');
      const put = await putAgent(agent.id, repoId, ['specs/a.md', 'docs/b.md', 'insights/c.md']);
      expect(put.statusCode).toBe(200);
      expect(put.json()).toEqual({ repo_id: repoId, paths: ['specs/a.md', 'docs/b.md', 'insights/c.md'] });

      const got = await getAgent(agent.id, repoId);
      expect(got.json()).toEqual({
        repo_id: repoId,
        paths: ['specs/a.md', 'docs/b.md', 'insights/c.md'],
        missing: [],
      });

      // reorder = a second PUT, last save wins (EC13)
      await putAgent(agent.id, repoId, ['insights/c.md', 'specs/a.md']);
      await putAgent(agent.id, repoId, ['docs/b.md']);
      expect((await getAgent(agent.id, repoId)).json().paths).toEqual(['docs/b.md']);

      const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
      expect(after.version).toBe(agent.version);
      const versions = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions` })).json();
      expect(versions).toHaveLength(1);
    });

    it('the same agent has an empty list on another repo (AC6)', async () => {
      const agent = await newAgent('ctx-other-repo');
      await putAgent(agent.id, repoId, ['specs/a.md']);
      const other = await getAgent(agent.id, bigRepoId);
      expect(other.statusCode).toBe(200);
      expect(other.json()).toEqual({ repo_id: bigRepoId, paths: [], missing: [] });
    });

    it('an attachment table has no content column (AC6)', async () => {
      const rows = (await pg.handle.db.execute(sql`
        select table_name, column_name from information_schema.columns
        where table_name in ('agent_context_docs', 'skill_context_docs')`)) as unknown as {
        table_name: string;
        column_name: string;
      }[];
      const cols = (name: string) => rows.filter((r) => r.table_name === name).map((r) => r.column_name).sort();
      expect(cols('agent_context_docs')).toEqual(['agent_id', 'created_at', 'id', 'path', 'position', 'repo_id']);
      expect(cols('skill_context_docs')).toEqual(['created_at', 'id', 'path', 'position', 'repo_id', 'skill_id']);
    });

    it('keeps a path that does not exist on disk and reports it in missing[] (EC4)', async () => {
      const agent = await newAgent('ctx-missing');
      const put = await putAgent(agent.id, repoId, ['specs/a.md', 'specs/not-yet.md']);
      expect(put.statusCode).toBe(200);
      const got = (await getAgent(agent.id, repoId)).json();
      expect(got.paths).toEqual(['specs/a.md', 'specs/not-yet.md']);
      expect(got.missing).toEqual(['specs/not-yet.md']);
    });

    it('missing[] lists a doc deleted after it was attached', async () => {
      const clone = join(cloneDir, 'acme', 'payments-api');
      await writeFile(join(clone, 'docs', 'temp.md'), 'temp');
      const agent = await newAgent('ctx-deleted');
      await putAgent(agent.id, repoId, ['docs/temp.md']);
      expect((await getAgent(agent.id, repoId)).json().missing).toEqual([]);
      await rm(join(clone, 'docs', 'temp.md'));
      expect((await getAgent(agent.id, repoId)).json().missing).toEqual(['docs/temp.md']);
    });

    it('51 paths gives 400 validation_error; a duplicate gives 400 validation_error', async () => {
      const agent = await newAgent('ctx-limits');
      const many = Array.from({ length: 51 }, (_, i) => `docs/n${i}.md`);
      const tooMany = await putAgent(agent.id, repoId, many);
      expect(tooMany.statusCode).toBe(400);
      expect(err(tooMany).code).toBe('validation_error');

      const dup = await putAgent(agent.id, repoId, ['specs/a.md', 'specs/a.md']);
      expect(dup.statusCode).toBe(400);
      expect(err(dup).code).toBe('validation_error');

      const fifty = await putAgent(agent.id, repoId, many.slice(0, 50));
      expect(fifty.statusCode).toBe(200);
    });

    it.each(BAD_PATHS)('PUT rejects traversal fixture %j with 400 context_path_invalid (NFR1)', async (p) => {
      const agent = await newAgent('ctx-bad');
      const res = await putAgent(agent.id, repoId, [p]);
      expect(res.statusCode).toBe(400);
      expect(err(res).code).toBe('context_path_invalid');
      expect((await getAgent(agent.id, repoId)).json().paths).toEqual([]);
    });

    it.each(['src/d.md', 'docs/leak-link.md', 'specs/secret-link.md'])(
      'PUT rejects %s (outside roots or symlink escape) and stores nothing',
      async (p) => {
        const agent = await newAgent('ctx-escape');
        const res = await putAgent(agent.id, repoId, [p]);
        expect(res.statusCode).toBe(400);
        expect(err(res).code).toBe('context_path_invalid');
        expect((await getAgent(agent.id, repoId)).json().paths).toEqual([]);
      },
    );

    it('unknown agent or repo gives 404; a body without repo_id stays 422', async () => {
      const agent = await newAgent('ctx-404');
      const nobody = '00000000-0000-4000-8000-000000000000';
      expect((await putAgent(nobody, repoId, [])).statusCode).toBe(404);
      const badRepo = await putAgent(agent.id, nobody, []);
      expect(badRepo.statusCode).toBe(404);
      expect(err(badRepo).code).toBe('repo_not_found');
      const shape = await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context`, payload: { paths: [] } });
      expect(shape.statusCode).toBe(422);
    });
  });

  describe('attachments (skills)', () => {
    it('PUT/GET work, keep order, and leave the skill version history unchanged (AC8)', async () => {
      const skill = await newSkill('ctx-skill');
      const before = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();

      const put = await app.inject({
        method: 'PUT',
        url: `/skills/${skill.id}/context`,
        payload: { repo_id: repoId, paths: ['insights/c.md', 'specs/a.md', 'specs/gone.md'] },
      });
      expect(put.statusCode).toBe(200);
      const got = await app.inject({ method: 'GET', url: `/skills/${skill.id}/context?repo_id=${repoId}` });
      expect(got.json()).toEqual({
        repo_id: repoId,
        paths: ['insights/c.md', 'specs/a.md', 'specs/gone.md'],
        missing: ['specs/gone.md'],
      });
      const other = await app.inject({ method: 'GET', url: `/skills/${skill.id}/context?repo_id=${bigRepoId}` });
      expect(other.json().paths).toEqual([]);

      const after = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
      expect(after).toEqual(before);
      const skillRow = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
      expect(skillRow.version).toBe(1);
    });

    it('rejects a traversal path on the skill route too', async () => {
      const skill = await newSkill('ctx-skill-bad');
      const res = await app.inject({
        method: 'PUT',
        url: `/skills/${skill.id}/context`,
        payload: { repo_id: repoId, paths: ['../x.md'] },
      });
      expect(res.statusCode).toBe(400);
      expect(err(res).code).toBe('context_path_invalid');
    });
  });

  describe('used_by_agents (AC4, EC14)', () => {
    it('counts direct agents and agents reaching the doc through a linked skill, and drops on agent delete', async () => {
      const doc = 'insights/c.md';
      const direct1 = await newAgent('used-direct-1');
      const direct2 = await newAgent('used-direct-2');
      const viaSkill = await newAgent('used-via-skill');
      const skill = await newSkill('used-skill');
      await putAgent(direct1.id, repoId, [doc]);
      await putAgent(direct2.id, repoId, [doc, 'specs/a.md']);
      await app.inject({
        method: 'PUT',
        url: `/skills/${skill.id}/context`,
        payload: { repo_id: repoId, paths: [doc] },
      });
      await app.inject({ method: 'POST', url: `/agents/${viaSkill.id}/skills`, payload: { skill_id: skill.id } });

      const usedBy = async () => {
        const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
        return res.json().docs.find((x: { path: string }) => x.path === doc).used_by_agents as number;
      };
      const before = await usedBy();
      expect(before).toBeGreaterThanOrEqual(3);

      const del = await app.inject({ method: 'DELETE', url: `/agents/${direct1.id}` });
      expect(del.statusCode).toBeLessThan(300);
      expect(await usedBy()).toBe(before - 1);

      // the preview header uses the same count
      const file = await app.inject({ method: 'GET', url: fileUrl(repoId, doc) });
      expect(file.json().used_by_agents).toBe(before - 1);

      // the deleted agent's rows are gone (FK cascade)
      const rows = (await pg.handle.db.execute(
        sql`select count(*)::int as n from agent_context_docs where agent_id = ${direct1.id}`,
      )) as unknown as { n: number }[];
      expect(rows[0]!.n).toBe(0);
    });

    it('does not double count an agent that has the doc directly and via a skill', async () => {
      const doc = 'docs/b.md';
      const before = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context` }))
        .json()
        .docs.find((x: { path: string }) => x.path === doc).used_by_agents as number;
      const agent = await newAgent('used-both');
      const skill = await newSkill('used-both-skill');
      await putAgent(agent.id, repoId, [doc]);
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}/context`, payload: { repo_id: repoId, paths: [doc] } });
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_id: skill.id } });
      const after = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context` }))
        .json()
        .docs.find((x: { path: string }) => x.path === doc).used_by_agents as number;
      expect(after).toBe(before + 1);
    });
  });
});
