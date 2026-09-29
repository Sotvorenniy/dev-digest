import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * Built-in skill bodies used by the seed, linked to the Test Quality Reviewer
 * and API Contract Reviewer agents. Mirrors ./seed-prompts.ts's pattern: the
 * markdown lives here, the DB-seeding logic (idempotent upsert + version
 * snapshot + agent link) lives alongside it and is called from ./seed.ts.
 *
 * Test Quality Reviewer intentionally ships with 3 skills, not 4 — the 4th
 * ("test-data-builder-convention" or similar) is added live through the skill
 * import UI during manual verification, to exercise that flow end-to-end.
 */

export const UNCOVERED_BRANCH_CHECK = `# Uncovered branch check

Flag a PR whose tests only exercise the happy path, leaving a branch or edge
case in the changed code with no test that would fail if it broke.

## What counts as a gap
- A new \`if\`/\`switch\`/ternary branch, early return, or thrown error with no
  test that drives execution down that specific path.
- An empty-collection, null/undefined, zero, or boundary (first/last item,
  max length, off-by-one) input that the changed code visibly handles but no
  test supplies.
- A catch block, retry, or fallback path added in this diff with nothing that
  actually triggers the failure it is meant to handle.
- A loop or aggregation whose zero-, one-, and many-item cases behave
  differently, but only one of those is tested.

## What does NOT count
- Pre-existing branches the diff does not touch — do not demand a rewrite of
  the whole file's coverage, only the lines this PR changed or added.
- A branch that is genuinely unreachable (e.g. guarded by a type system
  invariant) — note it, do not block on it.
- Style/formatting of the test file itself; this rubric is about coverage,
  not test code aesthetics.

## How to check
For each new or modified branch in the diff, ask: "which test in this diff
would fail if this branch's condition or body were wrong?" If no test in the
diff would fail, that is the finding — name the exact branch (file:line) and
the specific input that would exercise it but currently doesn't.

## Severity guidance
- The core new behaviour's happy path is tested but its most consequential
  failure/edge branch (the one most likely to fire in production — an error
  path, a boundary, an empty case) is untested → CRITICAL.
- A rare or low-impact edge case is untested → WARNING.
- A minor branch with negligible real-world likelihood → SUGGESTION.`;

export const NO_EXCESSIVE_MOCKING = `# No excessive mocking

Flag a test that mocks so much of its own subject or its collaborators that a
passing test no longer gives confidence the real code works.

## Patterns to flag
- **Mocking the unit under test itself** — stubbing out the function, method,
  or module the test claims to verify (directly, or through a mock of a
  thin wrapper around it), so the assertion checks the mock's behaviour, not
  the code's.
- **Over-mocking collaborators** — replacing so many of a function's real
  dependencies with mocks that the remaining "real" code path is trivial,
  and a regression in the interaction between the mocked pieces would never
  surface.
- **Mocks that encode the expected answer** — a mock configured to return
  exactly what the assertion checks for, making the test tautological
  (it will pass even if the real implementation is wrong, because the mock
  never consults it).
- **Stale mock drift** — a mock whose shape/behaviour no longer matches the
  real dependency it replaces (e.g. the real API added a required field, the
  mock still returns the old shape), which lets the test pass while the real
  integration is broken.
- Mocking a DB, HTTP client, or filesystem call in a test that is supposed to
  be the one integration test for that workflow (see this repo's
  \`*.it.test.ts\` convention below) — that defeats the point of the
  integration suite.

## What's fine
- Mocking genuinely external systems (a third-party API, an LLM provider, a
  git remote) in a UNIT test — that's the hermetic-by-design pattern this repo
  uses (\`src/adapters/mocks.ts\`), not excessive mocking.
- Mocking time/randomness for determinism.

## How to check
For each mock in a changed/new test, ask: "if the real implementation behind
this mock were subtly wrong, would this test still pass?" If yes, the mock is
hiding the thing the test should be proving.

## Severity guidance
- The unit under test is mocked, or the mock encodes the expected result
  (tautological test) → CRITICAL — the test provides no real signal.
- Heavy-but-not-total mocking that meaningfully reduces confidence in a
  non-trivial interaction → WARNING.
- A borderline case where the mock is reasonable but could be narrower →
  SUGGESTION.`;

export const TEST_NAMING_CONVENTION = `# Test naming convention (\`*.it.test.ts\`)

This repo splits \`server/\` tests into two CI lanes by filename alone:
- **hermetic unit lane** — \`vitest run --exclude '**/*.it.test.ts'\`, no Docker.
- **integration lane** — \`vitest run .it.test\`, spins up a real Postgres via
  testcontainers.

There is no other signal CI uses to route a test. A test that touches a real
database (imports \`test/helpers/pg.ts\`), a Docker container, or any other
real out-of-process dependency, but is NOT named \`*.it.test.ts\`, silently
lands in the hermetic unit lane. That lane does not have Docker available, so
best case the test fails there; worst case it happens to work in a
developer's environment but is skipped or flaky in CI, and either way the
integration suite loses a test it should have.

## What to flag
- A test file that imports \`test/helpers/pg.ts\`, opens a real DB connection,
  or otherwise depends on a live Postgres/testcontainer, whose filename does
  NOT end in \`.it.test.ts\` (e.g. it ends in plain \`.test.ts\`).
- A file named \`*.it.test.ts\` that does NOT actually touch a real DB/Docker
  dependency — the inverse mistake, which needlessly pulls a hermetic test
  into the slower, Docker-gated lane.
- A new test file placed in \`server/test/\` (flat, kebab-case topic name per
  this repo's convention) that mixes hermetic and DB-backed cases in one file
  — split it so the DB-backed cases can carry the \`.it.test.ts\` suffix on
  their own file.

## How to check
For each new/changed test file: does it import \`test/helpers/pg.ts\`, or
otherwise open a real database/container connection? If yes, its filename
must end in \`.it.test.ts\`. If its filename ends in \`.it.test.ts\` but it never
touches a real DB/Docker, flag that mismatch too.

## Severity guidance
- A DB/Docker-backed test file is missing the \`.it.test.ts\` suffix → CRITICAL
  — it silently breaks the CI lane split (fails or is skipped where it
  shouldn't be, or runs in the wrong lane).
- A \`.it.test.ts\` file with no real DB/Docker dependency (unnecessarily slow
  lane) → WARNING.
- Ambiguous cases (e.g. a helper import that isn't clearly \`pg.ts\` but smells
  like it) → SUGGESTION, and say what you'd need to see to be sure.`;

export const BREAKING_ROUTE_SIGNATURE_CHECK = `# Breaking route signature check

Flag a change to an EXISTING route's request or response contract that would
break a caller who worked against the contract as it was before this diff.

## What counts as breaking
- **Response shape** — a field removed, renamed, or its type changed (string
  → number, scalar → array, etc.); a field that was always present becomes
  optional/nullish, or a nullable field becomes non-optional in a way callers
  can't rely on without checking the diff.
- **Request shape** — a previously optional field made required; a field
  removed, renamed, or its accepted type/format narrowed; an accepted enum
  value removed (removal is breaking, addition is not).
- **Status codes** — an existing route's success or error status code
  changes (200 → 201, 200 → 204 with a body callers read, a specific error
  case moved from one 4xx/5xx code to another).
- **Route surface** — a route path or HTTP method removed/renamed, or new
  required auth/params added that an existing, already-documented caller does
  not send.

## What does NOT count (additive, not breaking)
- A brand-new route or a brand-new schema with no prior callers.
- A new OPTIONAL request field, a new response field appended alongside the
  existing ones, or a new enum value added (not removed).
- An internal-only type never serialized over the wire.

## How to check
For each route whose zod schema or handler changed in this diff, diff the
BEFORE vs AFTER shape field-by-field: for every field that existed before,
ask "would a caller sending/expecting the OLD shape still work unchanged?"
If no for any field, name it, the file:line of the schema/handler change, and
state the old shape vs the new shape explicitly.

## Severity guidance
- A field removed/renamed, a type changed, required-ness tightened, or a
  status code changed on a route that already had callers → CRITICAL.
- A breaking change confined to an internal-only or apparently-unused field,
  or one whose blast radius is unclear → WARNING.
- A safe/additive change worth flagging for awareness (e.g. deprecating a
  field without removing it) → SUGGESTION.`;

interface SkillSeed {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
  source?: 'manual' | 'imported_file';
}

const TEST_QUALITY_SKILLS: SkillSeed[] = [
  {
    name: 'uncovered-branch-check',
    description: 'Flags PRs whose tests only cover the happy path.',
    type: 'rubric',
    body: UNCOVERED_BRANCH_CHECK,
  },
  {
    name: 'no-excessive-mocking',
    description: 'Flags tests that mock away the thing they claim to verify.',
    type: 'convention',
    body: NO_EXCESSIVE_MOCKING,
  },
  {
    name: 'test-naming-convention',
    description: 'Flags a DB-backed test missing the *.it.test.ts suffix.',
    type: 'convention',
    body: TEST_NAMING_CONVENTION,
  },
];

const API_CONTRACT_SKILLS: SkillSeed[] = [
  {
    name: 'breaking-route-signature-check',
    description: 'Flags breaking changes to an existing route request/response contract.',
    type: 'rubric',
    body: BREAKING_ROUTE_SIGNATURE_CHECK,
  },
];

const API_CONTRACT_DOCS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'docs', 'agent-skills', 'api-contract',
);

/**
 * The four API Contract skills live as markdown under docs/agent-skills/api-contract/
 * (the same files a user imports through the UI). Seeding them with
 * source 'imported_file' gives the agents skills of imported origin. A missing
 * file is skipped so the seed never fails on a checkout without docs/.
 */
function loadImportedApiContractSkills(): SkillSeed[] {
  const names = ['breaking-change', 'response-schema', 'semver-discipline', 'deprecation-policy'];
  const out: SkillSeed[] = [];
  for (const name of names) {
    const file = join(API_CONTRACT_DOCS_DIR, `${name}.md`);
    if (!existsSync(file)) continue;
    const body = readFileSync(file, 'utf8');
    const description = body.split('\n').find((l, i) => i > 0 && l.trim() && !l.startsWith('#'))?.trim() ?? name;
    out.push({ name, description, type: 'rubric', body, source: 'imported_file' });
  }
  return out;
}

/** Idempotently upsert one skill by (workspaceId, name) and snapshot version 1. */
async function upsertSkill(db: Db, workspaceId: string, seed: SkillSeed) {
  const [existing] = await db
    .select()
    .from(t.skills)
    .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, seed.name)));
  if (existing) return existing;

  const [row] = await db
    .insert(t.skills)
    .values({
      workspaceId,
      name: seed.name,
      description: seed.description,
      type: seed.type,
      source: seed.source ?? 'manual',
      body: seed.body,
      enabled: true,
      version: 1,
    })
    .returning();

  await db.insert(t.skillVersions).values({
    skillId: row!.id,
    version: 1,
    body: row!.body,
    changeNote: null,
  });

  return row!;
}

/** Idempotently link a skill to an agent at the given order (mirrors AgentsRepository.linkSkill). */
async function linkSkill(db: Db, agentId: string, skillId: string, order: number) {
  await db
    .insert(t.agentSkills)
    .values({ agentId, skillId, order })
    .onConflictDoUpdate({
      target: [t.agentSkills.agentId, t.agentSkills.skillId],
      set: { order },
    });
}

/**
 * Seed the built-in skills for the "before/after skills" demo agents and link
 * them in seed-file order. Called from ./seed.ts after the seedAgents loop,
 * once the Test Quality Reviewer / API Contract Reviewer agent ids are known.
 */
export async function seedSkills(
  db: Db,
  workspaceId: string,
  agentIds: { testQuality: string; apiContract: string },
): Promise<void> {
  for (const [i, seed] of TEST_QUALITY_SKILLS.entries()) {
    const row = await upsertSkill(db, workspaceId, seed);
    await linkSkill(db, agentIds.testQuality, row.id, i);
  }

  for (const [i, seed] of [...API_CONTRACT_SKILLS, ...loadImportedApiContractSkills()].entries()) {
    const row = await upsertSkill(db, workspaceId, seed);
    await linkSkill(db, agentIds.apiContract, row.id, i);
  }
}
