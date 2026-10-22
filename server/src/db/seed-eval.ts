import { and, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * Seeded eval cases for the Security Reviewer (SPEC-06 AC16). Each case carries its own
 * small new-file patch; every expectation item lies inside the patch's new-side hunk, so a
 * correct finding survives the citation gate. Secrets are obviously fake.
 */

interface SeedEvalCase {
  name: string;
  path: string;
  prNumber: number;
  prTitle: string;
  prBody: string | null;
  lines: string[];
  type: 'must_find' | 'must_not_flag';
  item: {
    start: number;
    end: number;
    title: string;
    severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
    category: 'bug' | 'security' | 'perf' | 'style' | 'test';
  };
}

const patchOf = (lines: string[]): string =>
  [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join('\n');

export const SEED_EVAL_CASES: SeedEvalCase[] = [
  {
    name: 'hardcoded-live-api-key src/payments/client.ts:3',
    path: 'src/payments/client.ts',
    prNumber: 482,
    prTitle: 'Add payments client',
    prBody: 'Adds a thin client for the payment provider.',
    lines: [
      "import { request } from './http';",
      '',
      "const API_KEY = 'sk_live_TEST_FAKE_0000000000000000';",
      '',
      'export function charge(amount: number) {',
      "  return request('/charge', { amount }, { headers: { Authorization: `Bearer ${API_KEY}` } });",
      '}',
    ],
    type: 'must_find',
    item: {
      start: 3,
      end: 3,
      title: 'Hardcoded live API key',
      severity: 'CRITICAL',
      category: 'security',
    },
  },
  {
    name: 'sql-string-concatenation src/db/users.ts:4',
    path: 'src/db/users.ts',
    prNumber: 483,
    prTitle: 'Look users up by email',
    prBody: null,
    lines: [
      "import { db } from './client';",
      '',
      'export async function findUser(email: string) {',
      "  return db.query(\"SELECT * FROM users WHERE email = '\" + email + \"'\");",
      '}',
    ],
    type: 'must_find',
    item: {
      start: 4,
      end: 4,
      title: 'SQL built by string concatenation',
      severity: 'CRITICAL',
      category: 'security',
    },
  },
  {
    name: 'missing-auth-check src/routes/admin.ts:3',
    path: 'src/routes/admin.ts',
    prNumber: 484,
    prTitle: 'Add admin purge route',
    prBody: 'Adds POST /admin/purge to clear stale sessions.',
    lines: [
      "import type { FastifyInstance } from 'fastify';",
      '',
      'export default async function adminRoutes(app: FastifyInstance) {',
      "  app.post('/admin/purge', async () => {",
      '    await purgeAllSessions();',
      '    return { ok: true };',
      '  });',
      '}',
    ],
    type: 'must_find',
    item: {
      start: 4,
      end: 7,
      title: 'Destructive admin route has no authentication or authorization',
      severity: 'CRITICAL',
      category: 'security',
    },
  },
  {
    name: 'disabled-tls-verification src/http/agent.ts:4',
    path: 'src/http/agent.ts',
    prNumber: 485,
    prTitle: 'Fix flaky upstream calls',
    prBody: 'Upstream cert chain was failing, so we skip verification.',
    lines: [
      "import https from 'node:https';",
      '',
      'export const agent = new https.Agent({',
      '  rejectUnauthorized: false,',
      '});',
    ],
    type: 'must_find',
    item: {
      start: 3,
      end: 5,
      title: 'TLS certificate verification disabled',
      severity: 'CRITICAL',
      category: 'security',
    },
  },
  {
    name: 'token-written-to-log src/auth/login.ts:5',
    path: 'src/auth/login.ts',
    prNumber: 486,
    prTitle: 'Log login failures',
    prBody: null,
    lines: [
      "import { logger } from '../logger';",
      '',
      'export function onLoginFailed(user: string, token: string) {',
      "  logger.info('login failed for ' + user);",
      "  logger.info('session token: ' + token);",
      '}',
    ],
    type: 'must_find',
    item: {
      start: 5,
      end: 5,
      title: 'Session token written to the log',
      severity: 'WARNING',
      category: 'security',
    },
  },
  {
    name: 'test-fixture-key src/__tests__/fixtures.ts:2',
    path: 'src/__tests__/fixtures.ts',
    prNumber: 487,
    prTitle: 'Add webhook test fixtures',
    prBody: 'Fixtures for the webhook signature tests.',
    lines: [
      '// Fake value used only by the signature tests.',
      "export const FIXTURE_WEBHOOK_SECRET = 'whsec_TEST_FAKE_fixture_only';",
    ],
    type: 'must_not_flag',
    item: {
      start: 2,
      end: 2,
      title: 'Hardcoded secret in a test fixture',
      severity: 'WARNING',
      category: 'security',
    },
  },
  {
    name: 'parameterised-query src/db/orders.ts:4',
    path: 'src/db/orders.ts',
    prNumber: 488,
    prTitle: 'Look orders up by customer',
    prBody: null,
    lines: [
      "import { db } from './client';",
      '',
      'export async function ordersFor(customerId: string) {',
      "  return db.query('SELECT * FROM orders WHERE customer_id = $1', [customerId]);",
      '}',
    ],
    type: 'must_not_flag',
    item: {
      start: 4,
      end: 4,
      title: 'SQL injection in order lookup',
      severity: 'CRITICAL',
      category: 'security',
    },
  },
  {
    name: 'env-var-read src/config/stripe.ts:2',
    path: 'src/config/stripe.ts',
    prNumber: 489,
    prTitle: 'Read the Stripe key from the environment',
    prBody: 'Moves the key out of source into STRIPE_API_KEY.',
    lines: [
      '// The key comes from the environment, never from source.',
      'export const STRIPE_API_KEY = process.env.STRIPE_API_KEY ?? "";',
    ],
    type: 'must_not_flag',
    item: {
      start: 2,
      end: 2,
      title: 'Hardcoded Stripe API key',
      severity: 'CRITICAL',
      category: 'security',
    },
  },
];

/** Idempotent by (owner_kind 'agent', owner_id, name): re-running leaves exactly one row per case. */
export async function seedEvalCases(db: Db, workspaceId: string, agentId: string): Promise<void> {
  for (const c of SEED_EVAL_CASES) {
    const [existing] = await db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
          eq(t.evalCases.name, c.name),
        ),
      );
    if (existing) continue;
    await db.insert(t.evalCases).values({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
      name: c.name,
      inputDiff: patchOf(c.lines),
      inputFiles: [c.path],
      inputMeta: { pr_number: c.prNumber, title: c.prTitle, body: c.prBody },
      expectedOutput: {
        type: c.type,
        items: [
          {
            file: c.path,
            start_line: c.item.start,
            end_line: c.item.end,
            title: c.item.title,
            severity: c.item.severity,
            category: c.item.category,
          },
        ],
      },
      sourceFindingId: null,
    });
  }
}
