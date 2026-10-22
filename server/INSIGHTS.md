# Insights — server

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it.

Entries are append-only: enrich or correct an existing one, never delete it.
Format — an H3 stating the claim, a dated body, and `path:line` evidence.
`/engineering-insights` maintains this file; see `.claude/skills/engineering-insights/`.

## What Works
<!-- Approaches and solutions that proved out. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — never skip it. -->

### The static pricing table shipped fabricated prices for every OpenRouter slug
`2026-09-25` — `PRICING` in `server/src/adapters/llm/pricing.ts` looked
authoritative but was wrong for all four OpenRouter models it listed, checked
against `openrouter.ai/api/v1/models`: `z-ai/glm-4.7-flash` was a 0/0 "free
baseline" while actually costing $0.0605/$0.40 per 1M, so a paid run rendered a
confident "$0.00"; `deepseek-v4-flash` ~3x over; `z-ai/glm-5.1` ~40% under;
`z-ai/glm-4.7-flashx` is not a real slug. It also listed no current Anthropic
model, so a run on the documented default priced to null. Treat it as a
last-resort snapshot, never truth: verify a row against the provider before
relying on it, and DELETE a row you cannot verify — an absent slug yields null
and renders "—", while a wrong row renders as fact.
Evidence: `server/src/adapters/llm/pricing.ts:1-20`,
`server/test/adapters.test.ts` ("never prices a paid model at zero")

### Trace usage stats: memory_pulled is always empty, skills_used is names only
`2026-10-19` — `run-executor` writes `memory_pulled: []` on every run, so any
"most-pulled memory" view shows its empty state until a feature records pulled
memory with an id. `prompt_assembly.skills_used` holds skill NAMES in prompt
order, not ids, and records inclusion in the prompt, not model use; a renamed
skill splits its usage history. Read both through guards that treat any odd
shape as "no data" — old traces lack the fields.
Evidence: `server/src/modules/reviews/run-executor.ts:412,600`,
`server/src/modules/agent-performance/domain.ts` (`readSkillsUsed`,
`readMemoryPulled`)

### A PR title must not be interpolated into reviewer-core's `task` line
`2026-10-22` — The `task` line goes into the user message outside
`wrapUntrusted`, so a crafted title stored in an eval case is replayed on every
run and can push the model to withhold findings. Pass title and body through
`prDescription` instead: it is cut to 4000 chars and delimiter-wrapped.
Evidence: `reviewer-core/src/prompt.ts:219-227`,
`server/src/modules/eval/domain.ts` (`evalPrDescription`)

## Codebase Patterns
<!-- Module layout, DI flow, repository conventions — with the reason. -->

### A service can't call `resolveFeatureModel` directly — it takes `Container`, which cycles back
`2026-09-28` — `modules/settings/feature-models.ts`'s `resolveFeatureModel(container, workspaceId,
id)` takes `Container` as its first parameter, so calling it from `platform/container.ts` (to
bind a per-feature service's model resolution into a closure) creates a `container.ts <->
feature-models.ts` `no-circular` violation the moment `container.ts` imports it — even though
`container.ts` is otherwise exempt from every other onion-architecture rule as the composition
root. A `service.ts` obviously can't call it either (services must never import `Container` at
all — see the onion-architecture skill). Worked around for the `conventions` module by
duplicating the tiny override-read/default-fallback logic directly in `container.ts` as a
private method reading `t.settings` + `FEATURE_MODELS` itself, never importing
`feature-models.ts`. A second feature needing this should promote it to a real method/port
instead of a third copy-paste.
Evidence: `server/src/modules/settings/feature-models.ts:51` (`resolveFeatureModel` signature),
`server/src/platform/container.ts` (`resolveFeatureModelFor`)

### Widening `SkillSource` needs no migration — the column is `text`
`2026-09-28` — `skills.source` is `text('source', { enum })`, so the enum is
TypeScript-only. Adding a value (e.g. `imported_file`) means editing the Drizzle
enum plus BOTH vendored `SkillSource` zod enums; `drizzle-kit generate` emits
nothing for it. Do not hand-write a migration. Non-manual sources are still
forced `enabled: false` by `SkillsService.create` and wrapped as untrusted in
`run-executor.ts`, whatever the new value is called.
Evidence: `server/src/db/schema/skills.ts:13`,
`server/src/vendor/shared/contracts/knowledge.ts:118`

### Findings have no `api`/contract category — API-contract agents must use `bug`
`2026-09-28` — `FindingCategory` is `bug | security | perf | style | test`, so a
reviewer prompt for API-contract problems has to tell the model to emit `bug`;
no other value fits. Adding a real category means editing both vendored
`findings.ts` copies plus the DB and UI enums, so treat it as its own task.
Evidence: `server/src/vendor/shared/contracts/findings.ts:14`

### The intent `inputs_hash` cache covers DB-held inputs only, not live issue/doc text
`2026-10-04` — `IntentService.derive` skips the classifier when the hash of
title, branch, body, head sha, commit subjects, paths and provider/model is
unchanged. Linked issue bodies, plan/spec contents and GitHub labels are
fetched live and are NOT in the key, so editing a linked issue never
invalidates a cached intent. Pass `force: true` (the on-demand route) to
re-derive. Labels are also not persisted: only `sources` (id, kind, ref,
fetched) reach `pr_intent`.
Evidence: `server/src/modules/intent/domain.ts:183`,
`server/src/modules/intent/service.ts:115`

### Plan/spec `readFile` needs a containment guard — `readCloneFile` still has the unguarded shape
`2026-10-04` — Doc paths come from untrusted PR text. `SimpleGitClient.readFile`
now resolves the path and rejects NUL bytes and anything outside the clone
root; before the intent layer it did a bare `join`. The same bare-join shape
survives in `conventions/helpers.ts` `readCloneFile`; it is only safe while
every caller passes a fixed filename. Never feed it a path derived from PR
content — reuse the guarded adapter method instead.
Evidence: `server/src/adapters/git/simple-git.ts:207`,
`server/src/modules/conventions/helpers.ts:173`

### The classifier gets hunk headers, never patch bodies — and an unreadable link is flagged in the intent
`2026-10-04` — `IntentRepositoryPort.listFiles` returns `{path, hunks}` where `hunks` are only the
`@@ -a,b +c,d @@ ctx` lines of `pr_files.patch` (`extractHunkHeaders`). The full diff goes only to the
review call, so it is never sent twice. When a linked issue/ticket/plan/spec is `fetched:false`,
`finaliseIntent` appends "[Missing context: ...]" to the intent and caps confidence at 0.5 instead
of letting the model fill the gap. The classifier call logs `intent.prompt.assembled`: section names,
chars, token estimate, model, source id/kind/fetched, tokens, cost — no text, refs or hunk lines.
Evidence: `server/src/modules/intent/domain.ts` (`extractHunkHeaders`, `finaliseIntent`),
`server/src/modules/intent/service.ts`, `server/test/intent-service.test.ts`

### `pr_intent` has exactly one writer: `IntentRepository.upsertIntent`
`2026-10-04` — The legacy three-field `upsertIntent`/`getIntent` on the
reviews repository were dead code and are removed; the table now carries
confidence, basis, sources, requirements and the cache hash, so a second
writer would silently drop those columns. Add writes through the intent module
only. The review run executor consumes it via the `IntentDerivePort` in
`intent/ports.ts` (cross-module imports may only target domain/ports/types).
Evidence: `server/src/modules/intent/repository.ts:79`,
`server/src/modules/intent/ports.ts`

### Prompt logs are metadata-only; `run_traces.trace` still stores the full prompt
`2026-10-04` — The `prompt.assembled` pino event (one per agent run) carries only
section name, fixed source label, chars, ceil(chars/4) tokens, model, agent and
`correlation_id` (Fastify `req.id`, shared by every agent run of a trigger and
the intent derive). It never holds prompt, diff, skill, spec or memory text.
That is a logging rule only: `run_traces.trace.prompt_assembly` still persists
the FULL prompt text (diff and specs included), so treat that table as
sensitive. `PROMPT_LOG_VERBOSE` adds only hashes/line counts/per-skill sizes and
is honoured solely when `NODE_ENV=development` AND `API_HOST` is loopback
(127.0.0.1/localhost/::1); the server used to hardcode `0.0.0.0`, so the default
`API_HOST` stays `0.0.0.0` and verbose is therefore OFF unless you also set
`API_HOST=127.0.0.1`. A refused request logs one boot `warn`.
Evidence: `server/src/platform/prompt-log.ts`, `server/src/platform/config.ts`
(`resolvePromptLogVerbose`), `server/src/modules/reviews/run-executor.ts`

### MAX_CALLERS_PER_SYMBOL is a global slice, not a per-symbol cap
`2026-10-09` — On the persistent path `repoIntel.getBlastRadius` sorts all
callers by rank, then slices to 20 in total. A PR with many changed symbols
shows 20 callers overall, not 20 each; the ripgrep fallback is uncapped.
`blast/mapper.ts` deliberately does not re-cap, so the UI shows what the facade
returns.
Evidence: `server/src/modules/repo-intel/service.ts` (~372-386),
`server/src/modules/blast/mapper.ts`

### The persistent blast path has no same-file caller filter
`2026-10-09` — Only the ripgrep fallback excludes the declaring file from a
symbol's callers. `blast/mapper.ts` therefore drops callers whose `file` equals
the declaring file of their `viaSymbol`, so a symbol never lists itself.
Not confirmed against the persistent-path SQL in `repo-intel/repository.ts`.
Evidence: `server/src/modules/blast/mapper.ts:17`,
`server/test/blast-mapper.test.ts`

### Env list values holding globs are split on ';', not ','
`2026-10-14` — `PROJECT_CONTEXT_ROOTS` is a list of globs, and the default
`**/{specs,docs,insights}/**/*.md` contains commas inside `{…}`, so a
comma-split env list would cut a glob in half. Use `;` for any env list whose
items may be globs.
Evidence: `server/src/platform/config.ts:81,111-112`

### Repo-authored text that becomes a copyable command needs a filter, not only a UI warning
`2026-10-14` — Onboarding offered README shell-fence lines verbatim as "Run
locally" commands, one click from the clipboard: `curl … | sh`, `a; rm -rf ~`,
or a lone `\r` / U+202E bidi override that hides part of the line in a
terminal. Security review raised it twice (MEDIUM, then LOW for `&`, `>`,
`$VAR`). The filter is `README_UNSAFE`
(`/[\u0000-\u001f\u007f`;|&<>]|\$[({A-Za-z_]|\p{Cf}/u`) plus a 200-char cap.
Evidence: `server/src/modules/onboarding/domain.ts:120`,
`server/test/onboarding-domain.test.ts`

### Seed fixture changes reach only a fresh DB — PR #482 rows are written inside `if (!pr)`
`2026-10-15` — `seed.ts` inserts PR #482's files, review and brief only when
the PR does not exist yet, so editing a seeded patch or adding a seeded row
does nothing on an existing dev DB. The hermetic e2e stack (fresh DB) sees the
change; your dev DB does not. Check a seed change against a fresh DB.
Evidence: `server/src/db/seed.ts:106`, `server/src/db/seed-brief.ts`

### A finding reaches a run only through reviews.run_id, which has no FK
`2026-10-18` — Per-run aggregates (agent performance, per-agent stats) join
findings to `agent_runs` through `reviews.run_id`, a plain uuid with no foreign
key. A review whose `run_id` is null (e.g. the seeded PR #482 review) is
invisible to every per-run metric. These aggregates count every run's findings,
unlike the PR-list "newest review per agent" rollup (root INSIGHTS).
Evidence: `server/src/db/schema/reviews.ts:20`,
`server/src/modules/agent-performance/repository.ts:57`

### `eval_cases.owner_id` has no FK, so agent delete must remove the cases itself
`2026-10-22` — The owner is polymorphic (`owner_kind`), so the database never
cascades. `AgentsRepository.deleteById` deletes the agent's cases in the same
transaction. A new eval owner kind needs the same line, or it leaves orphans.
Evidence: `server/src/modules/agents/repository.ts` (`deleteById`),
`server/src/db/schema/eval.ts`

## Tool & Library Notes
<!-- Quirks of Fastify, Drizzle, Postgres/pgvector, tsx, vitest. -->

### "pnpm is broken" is a corepack shim/package mismatch — a standalone pnpm fixes `pnpm add` too
`2026-09-28` — see `client/INSIGHTS.md`'s matching entry for the full
root-cause writeup (corepack's cached pnpm@12.6.0 ships `bin/pnpm.mjs` but the
corepack shim looks for `bin/pnpm.cjs`). It affects `server/` identically.
`npm install -g pnpm@10 --prefix /tmp/pnpm-global` then
`/tmp/pnpm-global/bin/pnpm install --frozen-lockfile` installs clean against
this repo's `lockfileVersion: '9.0'` lockfile — this is what actually unblocks
adding a new server dependency, not just running an existing script via
`./node_modules/.bin/<bin>`.
Evidence: `server/pnpm-lock.yaml:1`, `client/INSIGHTS.md` ("pnpm is broken" entry)

### PriceBook.estimate returns a different price on the first call after boot
`2026-09-25` — `estimate()` is synchronous and refreshes its OpenRouter cache in
the BACKGROUND, so the first call after a cold start (or 6h TTL expiry) returns
the static fallback table and later calls return live prices. Observed: the same
run re-priced at $0.00182308 then $0.00062349 seconds apart. Costs PERSISTED at
run completion are unaffected; only read-time recomputation skews. Call
`refresh()` at boot if a stable number matters.
Evidence: `server/src/platform/price-book.ts:59-72`

`2026-09-25` — Mitigated: `server/src/server.ts` now fires
`container.priceBook.refresh()` after `listen()`, so the first read already uses
live prices. Verified: three consecutive reads of one run all returned
0.0006198472, where the first previously returned the snapshot's 0.00182308. The
lazy-refresh behaviour itself is unchanged — a 6h TTL expiry mid-process still
skews one call, and only re-priced (null `cost_usd`) rows are affected.

### `container.llm()` cannot promise exactly one HTTP request; use `llmSingleShot`
`2026-10-14` — The default providers retry at two layers: SDK transport retries
and `withRetry` in `server/src/adapters/llm/openai.ts`. A feature whose spec
says "one LLM call" (onboarding tour) must use `container.llmSingleShot`
(`transportRetries: 0`, uncached) and pass `maxRetries: 0`.
`server/test/llm-single-shot.test.ts` has a control case proving the default
provider retries the same error, so the test can fail.
Evidence: `server/src/platform/container.ts:375-406`

## Recurring Errors & Fixes
<!-- Errors seen more than once, each with the fix that worked. -->

### dependency-cruiser's `--ignore-known` baseline is already stale for repo-intel's circular imports
`2026-09-28` — Running `.claude/skills/onion-architecture/scripts/check.sh` after ANY edit to
`platform/container.ts` — even one unrelated to repo-intel — reports 8 `no-circular` errors for
`repo-intel/service.ts`/`pipeline/{full,incremental}.ts`/`index.ts`/`routes.ts` and
`_shared/context.ts`, all routed through `container.ts`. These are NOT new: verified by
`git stash push -- server/src/platform/container.ts server/src/modules/index.ts` (reverting to
HEAD) and re-running the gate — the identical 8 errors reproduce on unmodified `HEAD`.
`.dependency-cruiser-known-violations.json`'s repo-intel cycle entries record a SHORTER path
(e.g. `container.ts → repo-intel/service.ts` direct) than what depcruise now reports (e.g.
`container.ts → repo-intel/index.ts → repo-intel/routes.ts → repo-intel/service.ts`) for the
same underlying cycle — the baseline is stale, not the code newly broken. Confirm with the
stash-and-recheck trick above before assuming your own change caused them, and don't
regenerate the baseline to "fix" them (regenerating would GROW it, violating the skill's
"baseline must only shrink" rule) unless deliberately paying down the repo-intel
Container-in-service violation itself.
Evidence: `server/.dependency-cruiser-known-violations.json` (repo-intel cycle entries),
`.claude/skills/onion-architecture/scripts/check.sh`

### A module's ports.ts importing the repo-intel/index.js barrel adds no-circular violations
`2026-10-09` — The barrel re-exports `routes.ts`, which pulls in `container.ts`.
Importing `RepoIntel` from it in `blast/ports.ts` took the onion `check.sh` from
the 8 baseline violations to 13. Import `repo-intel/types.js` instead (types
only, no cycle).
Evidence: `server/src/modules/blast/ports.ts:1`,
`.claude/skills/onion-architecture/scripts/check.sh`

### `reviews.it.test.ts` and the conventions rescan test fail on a clean HEAD
`2026-10-14` — With `vitest run .it.test`, `reviews.it.test.ts` ("runs a
review…", "finding actions: accept, dismiss" → `Cannot read properties of
undefined (reading 'findings')`) and
`conventions-rescan-preserves-decisions.it.test.ts` ("rescan wipes only pending
rows") fail on an untouched HEAD worktree too. Before blaming a change, re-run
those two files on a clean worktree (`git worktree add --detach`, symlink
`node_modules`).

### Run-driven IT tests flake: the PR-intent step makes a live OpenRouter call
`2026-10-14` — In `test/reviews.it.test.ts` a different test fails each run on
the 10 s `waitForPrRuns` timeout and passes alone. A traced run took 6.5 s,
6.4 s of it in the intent classifier calling a real `openrouter/deepseek`
model. Rerun before suspecting your change; the fix is a mocked intent
classifier or a longer timeout. In the same `--it` lane
`conventions-rescan-preserves-decisions.it.test.ts:144` failed reproducibly
with no conventions change.
Evidence: `server/test/reviews.it.test.ts` (`waitForPrRuns`)
`2026-10-15` — The trigger is the local `server/.env`: a clean HEAD worktree
without it passes `reviews.it` 6/6, and copying `server/.env` into that
worktree reproduces the `waitForPrRuns` hang. Run the lane without
`server/.env` to tell a real regression from this flake.

### A per-route `rateLimit` never fires under NODE_ENV=test — a 429 test needs its own dev app
`2026-10-15` — `app.ts` registers `@fastify/rate-limit` only when
`nodeEnv !== 'test'`, so a route's `config.rateLimit` is silently ignored in
the normal test app and the 11th POST still returns 200. For the 429 case,
build a separate app with `NODE_ENV=development` and `API_HOST=127.0.0.1`.
Evidence: `server/src/app.ts:110`, `server/test/brief.it.test.ts:256`

### `body: Schema.optional()` rejects an empty POST with 422 `validation_error`
`2026-10-22` — Under `fastify-type-provider-zod`, Fastify hands the validator
`null` for a body-less POST, and `.optional()` refuses `null`
("Expected object, received null"). A custom content-type parser returning
`undefined` does not help. Use `.nullish()` on any route the client calls
without a body (`api.post(path, undefined)` sends none).
Evidence: `server/src/modules/eval/routes.ts`,
`server/test/eval.it.test.ts` ("AC4/AC5: an empty-body POST")

## Session Notes
<!-- Dated summaries. Two lines each — this is not a chat replay. -->

## Open Questions
<!-- Left unresolved, for whoever picks it up next. -->
