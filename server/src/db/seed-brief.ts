import { PrBrief } from '@devdigest/shared';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * Seeded brief for demo PR #482 so the Overview shows a grounded brief before the
 * first generation. Every file reference and focus line sits inside the seeded
 * `src/config.ts` hunk (`@@ -8,3 +8,7 @@`, new lines 8-14) or a seeded PR path.
 */
export const SEED_PR_482_HEAD_SHA = 'a1b2c3d4e5f6';

export const SEED_PR_482_CONFIG_PATCH = [
  '@@ -8,3 +8,7 @@',
  ' export const config = {',
  '   port: 3001,',
  '   env: process.env.NODE_ENV,',
  '+  rateLimit: {',
  '+    windowMs: 60_000,',
  '+    max: 100,',
  '+  },',
].join('\n');

export const SEED_PR_482_BRIEF = PrBrief.parse({
  summary:
    'Adds a token-bucket rate limiter in front of the public API and wires its limits into the shared config. Existing user endpoints are touched to pass the caller identity through.',
  intent: null,
  blast: null,
  risks: {
    risks: [
      {
        kind: 'configuration',
        title: 'Limits are hard-coded defaults',
        explanation:
          'The window and maximum are set inline in the config, so tuning them needs a deploy and every environment shares one value.',
        severity: 'medium',
        file_refs: ['src/config.ts:10-13'],
      },
      {
        kind: 'behavior',
        title: 'User endpoints now depend on the limiter',
        explanation:
          'The user routes pass the caller identity to the limiter, so a limiter failure can now affect them.',
        severity: 'low',
        file_refs: ['src/api/users.ts'],
      },
    ],
  },
  history: null,
  review_focus: [
    { file: 'src/config.ts', line: 11, reason: 'New rate limit block: check the window and the maximum.' },
    { file: 'src/config.ts', line: 13, reason: 'Confirm the default maximum suits public traffic.' },
  ],
  head_sha: SEED_PR_482_HEAD_SHA,
  generated_at: '2026-01-01T00:00:00.000Z',
  missing_inputs: [
    { input: 'intent', reason: 'absent' },
    { input: 'blast', reason: 'unavailable' },
    { input: 'specs', reason: 'absent' },
    { input: 'issue', reason: 'absent' },
  ],
  specs_used: [],
  truncated: { files: 0, description: false, issue_body: false, callers: 0, blast_summary: false },
  dropped: { review_focus: 0, risks: 0, file_refs: 0 },
  model: 'seed',
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
});

export async function seedBrief(db: Db, prId: string): Promise<void> {
  await db.insert(t.prBrief).values({ prId, json: SEED_PR_482_BRIEF }).onConflictDoNothing();
}
