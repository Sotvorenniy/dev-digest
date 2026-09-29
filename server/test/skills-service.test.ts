import { describe, it, expect } from 'vitest';
import { SkillsService } from '../src/modules/skills/service.js';
import type { SkillsRepositoryPort } from '../src/modules/skills/ports.js';

function fakeRepo() {
  const inserted: Record<string, unknown>[] = [];
  const repo = {
    insert: async (v: Record<string, unknown>) => {
      inserted.push(v);
      return { id: 's1', ...v, agent_count: 0 };
    },
  } as unknown as SkillsRepositoryPort;
  return { repo, inserted };
}

describe('SkillsService.create source rules', () => {
  it.each(['imported_file', 'imported_url', 'extracted', 'community'] as const)(
    '%s is forced enabled:false even when the client sends true',
    async (source) => {
      const { repo, inserted } = fakeRepo();
      await new SkillsService({ repo }).create('ws', {
        name: 'n', type: 'custom', body: 'b', source, enabled: true,
      });
      expect(inserted[0]).toMatchObject({ source, enabled: false });
    },
  );

  it('manual defaults to enabled:true', async () => {
    const { repo, inserted } = fakeRepo();
    await new SkillsService({ repo }).create('ws', { name: 'n', type: 'custom', body: 'b' });
    expect(inserted[0]).toMatchObject({ source: 'manual', enabled: true });
  });
});
