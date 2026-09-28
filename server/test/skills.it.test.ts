import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills library: create/update/delete + the `skill_versions` body-history
 * idiom (mirrors agent_versions). Covers: source-based `enabled` default
 * (manual on, imported/community/extracted off regardless of what the client
 * sent), body edits bump the version and snapshot, `enabled` alone does not,
 * version history is newest-first, restoring an older version bumps again,
 * delete cascades to agent_skills links, and workspace scoping.
 */
d('skills module', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const manualBody = {
    name: 'Null Check Rubric',
    type: 'custom' as const,
    body: 'Flag any unguarded property access on a possibly-null value.',
  };

  it('a manual skill defaults enabled: true', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: manualBody });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ source: 'manual', enabled: true, version: 1 });
    await app.close();
  });

  it('an imported_url skill defaults enabled: false, even if the client sent true', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...manualBody, name: 'Imported Rubric', source: 'imported_url', enabled: true },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ source: 'imported_url', enabled: false });
    await app.close();
  });

  it('a body edit bumps the version and appends a skill_versions row, change_note round-trips', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: manualBody })
    ).json();

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: 'Flag any unguarded property access.', change_note: 'Tightened wording' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);
    expect(updated.json().body).toBe('Flag any unguarded property access.');

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({
      version: 2,
      body: 'Flag any unguarded property access.',
      change_note: 'Tightened wording',
    });
    expect(versions[1]).toMatchObject({
      version: 1,
      body: manualBody.body,
      change_note: null,
    });
    await app.close();
  });

  it('toggling enabled alone does NOT bump the version', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: manualBody })
    ).json();

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { enabled: false },
    });
    expect(updated.json().version).toBe(1);
    expect(updated.json().enabled).toBe(false);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('GET /skills/:id/versions is newest-first across several edits', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: manualBody })
    ).json();
    await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: 'v2' } });
    await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: 'v3' } });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    await app.close();
  });

  it('restoring an older version bumps to a new version with an auto change_note', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: manualBody })
    ).json();
    await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: 'v2 body' } });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${created.id}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 3, body: manualBody.body });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versions[0]).toMatchObject({
      version: 3,
      body: manualBody.body,
      change_note: 'Restored from v1',
    });
    await app.close();
  });

  it('deleting a skill cascades its agent_skills link', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: manualBody })
    ).json();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Reviewer',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      })
    ).json();

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: skill.id },
    });
    const before = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })
    ).json();
    expect(before).toHaveLength(1);

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(200);

    const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(after).toHaveLength(0);
    await app.close();
  });

  it('a skill in another workspace 404s', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills-ws' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign Skill',
      type: 'custom',
      body: 'x',
    });

    const res = await app.inject({ method: 'GET', url: `/skills/${foreign.id}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
