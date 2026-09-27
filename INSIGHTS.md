# Insights — root

Non-obvious findings and gotchas that span packages. Add an entry whenever
something surprised you, so the next agent/session doesn't relearn it.

Entries are append-only: enrich or correct an existing one, never delete it.
Format — an H3 stating the claim, a dated body, and `path:line` evidence.
`/engineering-insights` maintains this file; see `.claude/skills/engineering-insights/`.

## What Works
<!-- Approaches and solutions that proved out. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — never skip it. -->

### A PR-list rollup taken from the LATEST review contradicts the PR page
`2026-09-26` — `GET /repos/:id/pulls` derives SCORE from the newest review,
and the restored FINDINGS breakdown originally copied that. It is wrong for
findings: multi-agent review writes ONE review PER AGENT seconds apart, so the
newest review is whichever agent finished last. On the seeded PR #482 the list
showed "—" while the PR page's tab read "Agent runs 2". Findings roll up over
EVERY review on the PR — that is what the tab badge counts
(`allFindings = runs.flatMap(r => r.findings)`), so the two screens agree.
Score stays latest-only: a verdict is one review's, a finding list is not.
Evidence: `server/src/modules/pulls/routes.ts:115`,
`client/src/app/repos/[repoId]/pulls/[number]/page.tsx`

`2026-09-27` — correction: "every review" was the wrong end of the same
spectrum. It double-counts a re-run — the second pass of an agent ADDS its
findings instead of replacing them, so a PR reviewed three times reads 3×. The
rule on both surfaces is now the **newest review per `agent_id`**, summed:
`countedReviewIds` (`server/src/modules/pulls/helpers.ts`) for the list column,
`latestReviewPerAgent` (`client/src/lib/latest-reviews.ts`) for the "Agent runs
N" badge. Two copies because `@devdigest/shared` is type-only in the client;
they must move together. Two traps that go with it: a review with a null
`agent_id` needs its own bucket or the seeded PR #482 findings vanish
(`server/src/db/seed.ts:137` writes it with no agent), and the narrowing must
touch COUNTS only — `runs` still feeds the Review runs accordions and the
timeline chips, which are history.

### A contract field added to RunStats must be optional, not just nullable
`2026-09-25` — `RunStats` is parsed out of the `run_traces.trace` jsonb column,
so it validates documents written under OLDER schema versions. Adding
`cost_usd: z.number().nullable()` makes the KEY required and fails every trace
stored before the field existed; `.nullish()` is required. The same holds for
any contract that parses persisted JSON rather than a fresh request payload.
Evidence: `server/src/vendor/shared/contracts/trace.ts:65`,
`server/test/contracts.test.ts` ("parses a stored trace with no cost_usd key")

## Codebase Patterns
<!-- Conventions and architectural decisions, with the reason. -->

### Agent instructions live in AGENTS.md; CLAUDE.md is a thin `@AGENTS.md` stub
`2026-09-27` — Root and all four packages now carry BOTH files: `AGENTS.md`
holds every shared convention, `CLAUDE.md` is `@AGENTS.md` plus a `## Claude
Code` section for slash-command-only lines. Edit conventions in `AGENTS.md` —
editing the stub hides them from Codex/Cursor/Copilot. Do NOT add
`instructionFiles` to a `.claude/settings.json`: the default
`claude-md-or-agents-md` makes CLAUDE.md shadow AGENTS.md, which is exactly what
stops the import loading the same file twice; `claude-md-and-agents-md` would
double-load it. Verified by headless probe — facts from root and from
`client/AGENTS.md` both resolve.
Evidence: `CLAUDE.md:1`, `client/CLAUDE.md:1`, `AGENTS.md:75`

## Tool & Library Notes
<!-- Dependency quirks: Drizzle, Fastify, Next, pgvector, OpenRouter. -->

### A local edit to a committed skill is reverted by a `skills-lock.json` re-sync
`2026-09-27` — `.claude/skills/*` is committed but pinned to upstream sources by
`skills-lock.json`, so hand-edits there survive only until the next sync. The
AGENTS.md move required repointing `engineering-insights` to promote conventions
into `<pkg>/AGENTS.md`; a re-sync silently restores `CLAUDE.md`, and new
conventions then land in the import stub where other tools never see them.
Re-check that line after any skill update.
Evidence: `.claude/skills/engineering-insights/SKILL.md:225`, `skills-lock.json`

## Recurring Errors & Fixes
<!-- Errors seen more than once, each with the fix that worked. -->

### `pnpm <script>` fails via corepack — call node_modules/.bin directly
`2026-09-25` — Every `pnpm` invocation dies with `Error: Cannot find matching
keyid: {"signatures":[...]}` from corepack's signature check, so `pnpm
db:generate` / `db:migrate` / `test` cannot run as the READMEs document.
Workaround that works: call the binary directly —
`./node_modules/.bin/drizzle-kit generate`,
`./node_modules/.bin/tsx src/db/migrate.ts`, `./node_modules/.bin/vitest run`.
Evidence: corepack bundled with Node v20.17.0 (README asks for Node >= 22)

## Session Notes
<!-- Dated summaries. Two lines each — this is not a chat replay. -->

## Open Questions
<!-- Left unresolved, for whoever picks it up next. -->
