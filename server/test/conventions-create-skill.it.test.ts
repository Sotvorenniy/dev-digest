import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { insertConventionsRepo } from './helpers/conventions-fixture.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions-create-skill] Docker not available — skipping integration tests.');
}

/**
 * `POST /repos/:id/conventions/skill` merges every currently-`accepted`
 * candidate's evidence file into the created Skill's `evidence_files` —
 * regression guard for the skills-module gap fix (skills/{routes,service,
 * repository,ports}.ts previously dropped `evidence_files` on create even
 * though the column and contract already existed).
 */
d('conventions create-skill-from-accepted', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function insertAccepted(repoId: string, evidencePath: string, rule: string) {
    const [row] = await pg.handle.db
      .insert(t.conventions)
      .values({
        workspaceId,
        repoId,
        rule,
        evidencePath,
        evidenceSnippet: 'export async function fetchThing() {}',
        evidenceStartLine: 1,
        evidenceEndLine: 1,
        confidence: 0.8,
        status: 'accepted',
      })
      .returning();
    return row!.id;
  }

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({ config, db: pg.handle.db });
  }

  it('persists evidence_files from every accepted candidate, deduped', async () => {
    const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, null);
    await insertAccepted(repoId, 'src/a.ts', 'Always use async/await');
    await insertAccepted(repoId, 'src/b.ts', 'Log side effects with console.log');
    // A second candidate citing the SAME file as the first — evidence_files must dedup.
    await insertAccepted(repoId, 'src/a.ts', 'Another rule also evidenced in src/a.ts');
    // A pending candidate must NOT contribute its evidence file.
    await pg.handle.db.insert(t.conventions).values({
      workspaceId,
      repoId,
      rule: 'not yet reviewed',
      evidencePath: 'src/pending-only.ts',
      evidenceSnippet: 'x',
      confidence: 0.5,
      status: 'pending',
    });

    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: {
        name: 'Async/await conventions',
        type: 'convention',
        body: '# Async/await conventions\n\nAlways use async/await.',
      },
    });

    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({
      name: 'Async/await conventions',
      type: 'convention',
      source: 'extracted',
      // extracted skills are never auto-enabled, regardless of what's sent.
      enabled: false,
    });
    expect(new Set(skill.evidence_files)).toEqual(new Set(['src/a.ts', 'src/b.ts']));
    expect(skill.evidence_files).not.toContain('src/pending-only.ts');

    // Persisted, not just returned — fetch the skill back fresh.
    const fetched = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}` })
    ).json();
    expect(new Set(fetched.evidence_files)).toEqual(new Set(['src/a.ts', 'src/b.ts']));

    await app.close();
  });

  it('a repo with no accepted candidates creates a skill with an empty evidence_files array', async () => {
    const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, null);
    const app = await makeApp();

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { name: 'Empty', body: 'body' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().evidence_files).toEqual([]);
    await app.close();
  });

  it('agent_id links the new skill to that agent, appended after existing skills', async () => {
    const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, null);
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Linker', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
      })
    ).json();
    const existing = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'Pre-existing', type: 'custom', body: 'x' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_id: existing.id } });

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { name: 'repo-conventions', body: 'body', agent_id: agent.id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().agent_count).toBe(1);

    const links = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(links).toHaveLength(2);
    expect(JSON.stringify(links[0])).toContain(existing.id);
    expect(JSON.stringify(links[1])).toContain(res.json().id);
    await app.close();
  });

  it('an unknown agent_id 404s and creates no skill', async () => {
    const repoId = await insertConventionsRepo(pg.handle.db, workspaceId, null);
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { name: 'x', body: 'b', agent_id: '00000000-0000-4000-8000-000000000000' },
    });
    expect(res.statusCode).toBe(404);
    const after = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    expect(after).toBe(before);
    await app.close();
  });
});
