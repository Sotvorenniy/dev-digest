# Implementation Plan: Project Context (SPEC-01)

## 0. Spec readiness
- Source: `specs/2026-10-14-project-context.md` — SPEC-01, Status: approved.
- Spec readiness: ready ACs AC1–AC15 (AC15 is a manual check by design). Blocked ACs: None.
- Spec gaps routed to spec-creator (non-blocking, none blocks an AC):
  - NFR10 lists "reorder actions" for keyboard access, but NG9/P10 drop reordering (spec lines 90-92 vs 378). By the user's decision this plan treats "reorder" as **not applicable**. No reorder control is built, so there is nothing to make keyboard-operable.
  - AC4 "through a linked skill that attaches it" does not say whether a **disabled** skill (or disabled agent) counts. EC12 drops disabled skills at run time. The plan uses the literal AC4 wording and counts every linked skill and every agent, enabled or not (see §6 R4). Blocks: none.
  - The Contracts section says 400 `validation_error` for more than 50 paths or for duplicate paths. The app's global handler maps zod request-validation failures to **422** `validation_error` (`server/src/app.ts:131-139`). The plan keeps the spec's 400 by checking count and duplicates in the service with `AppError('validation_error', …, 400)`, not in the zod body schema. A body with the wrong shape (missing `repo_id`) stays 422. The spec does not cover that case. Blocks: none.
- Answered implementation questions:
  - Q1 glob matching: (a) an in-house glob-to-RegExp helper (`**`, `*`, `{a,b}` only) with hermetic unit tests.
  - Q2 path label: (a) `specs` entries accept `string | { label, text }` and `wrapUntrusted` escapes the label. Today's prompt stays byte-identical.
  - Q3 storage: (a) two tables, `agent_context_docs` and `skill_context_docs`, with FK cascades and `_uq` unique indexes. The migration comes from drizzle-kit only.
  - Q4 e2e: (a) no e2e flow. AC15 stays manual.
  - Execution mode: multi-agent, with phases contracts+schema → reviewer-core → server → client.
- Recommendations (all accepted, in scope): one new `server/src/modules/project-context/` module owns all five routes · reuse the vendored `Markdown` primitive for the preview · add `ProjectContextDoc` next to `SpecFile` (keep `SpecFile`) · the editors get `repo_id` from `useActiveRepo()` · OQ10 (trusted policy line) stays **out of scope**.

## 1. Goal and scope
- Goal: list and preview the Markdown docs under the configured search roots of a repo clone, attach their paths per repo to agents and skills, and inject the attached docs at review time as untrusted, path-labelled blocks under `## Project context`, with per-doc status and token cost in the run trace.
- In scope:
  - contracts in both vendored `shared` copies
  - two new tables plus a generated migration
  - `reviewer-core` path labels and label escaping
  - a server env var for search roots, an fs adapter behind a new port, the `project-context` module (5 routes) and the run-executor integration
  - the client nav entry, the `/repos/[repoId]/context` page, the agent and skill editor Context tabs and the trace drawer section
- Out of scope: NG1–NG10. OQ10/P12 (policy line), the e2e flow, editing/uploading docs, reorder, a search-root UI, the CI runner path, agent/skill versioning on attach, and `SpecFile`/`IndexStatus` removal.
- AC coverage:
  - AC1 — Steps 4, 5, 7 — `server/test/project-docs-fs.test.ts` (hermetic) + `server/test/project-context.it.test.ts` (it)
  - AC2 — Steps 9, 10, 11 — `client/src/components/app-shell/nav.test.tsx` + `client/src/app/repos/[repoId]/context/_components/ContextView/ContextView.test.tsx` (client)
  - AC3 — Steps 5, 7, 11 — `ContextView.test.tsx` (client) + `project-context.it.test.ts` (it)
  - AC4 — Steps 6, 7, 11 — `project-context.it.test.ts` (it) + `ContextView.test.tsx` (client)
  - AC5 — Steps 4, 5, 7 — `server/test/project-docs-path.test.ts` + `project-docs-fs.test.ts` (hermetic) + `project-context.it.test.ts` (it)
  - AC6 — Steps 2, 6, 7 — `project-context.it.test.ts` (it)
  - AC7 — Steps 9, 12, 13 — `client/src/components/context-doc-picker/ContextDocPicker.test.tsx` + `AgentEditor.test.tsx` (client)
  - AC8 — Steps 2, 6, 7, 14 — `project-context.it.test.ts` (it) + `SkillEditor.test.tsx` (client)
  - AC9 — Steps 3, 6, 7, 8 — `reviewer-core/test/prompt.test.ts` (reviewer-core) + `server/test/project-context-executor.test.ts` (hermetic)
  - AC10 — Steps 5, 6, 8 — `project-context-executor.test.ts` + `server/test/project-context-domain.test.ts` (hermetic)
  - AC11 — Steps 6, 8 — `project-context-domain.test.ts` + `project-context-executor.test.ts` (hermetic)
  - AC12 — Steps 3, 8 — `prompt.test.ts` (reviewer-core) + `project-context-executor.test.ts` (hermetic)
  - AC13 — Steps 1, 6, 8 — `project-context-executor.test.ts` + `server/test/contracts.test.ts` (hermetic)
  - AC14 — Steps 1, 15 — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx` (client)
  - AC15 — Steps 3, 8 (no dedicated step) — manual run with a real model (spec Traceability: "manual"). The trace `specs_read` part is also asserted in `project-context-executor.test.ts`.

## 2. Applicable constraints
- INSIGHTS entries:
  - root `INSIGHTS.md` — "A contract field added to RunStats must be optional, not just nullable" — `RunTrace.project_context` must be `.nullish()`, because stored traces are re-parsed (NFR12).
  - root `INSIGHTS.md` — "`pnpm <script>` fails via corepack" — every command is `./node_modules/.bin/<bin>`. No new dependency is planned.
  - `server/INSIGHTS.md` — "Plan/spec `readFile` needs a containment guard" — never use `conventions/helpers.ts` `readCloneFile`. The existing `SimpleGitClient.readFile` (`server/src/adapters/git/simple-git.ts:207-215`) does not follow symlinks, so the new adapter does its own realpath containment.
  - `server/INSIGHTS.md` — "Prompt logs are metadata-only; `run_traces.trace` still stores the full prompt" — the `prompt.assembled` event and Live Log lines carry counts, chars and tokens only, never doc text (NFR9). `project_context[].text` in the trace is allowed (AC13).
  - `server/INSIGHTS.md` — "`pr_intent` has exactly one writer … cross-module imports may only target domain/ports/types" — `reviews/run-executor.ts` imports only `project-context/ports.ts`, never its service or repository.
  - `server/INSIGHTS.md` — "A module's ports.ts importing the repo-intel/index.js barrel adds no-circular violations" — the new module and adapter never import `repo-intel/index.js`. `container.ts` imports `repo-intel/constants.js` directly.
  - `server/INSIGHTS.md` — "dependency-cruiser's `--ignore-known` baseline is already stale" — 8 known repo-intel cycles are expected from `check.sh`. Anything beyond them is new.
  - `reviewer-core/INSIGHTS.md` — "The scope policy is a trusted system-prompt addition … byte-identical" — with no `specs`, `assemblePrompt` output must not change (AC12). Doc text never goes into the system message.
  - `client/INSIGHTS.md` — "A `<AppShell>`-wrapped page view needs `@/components/app-shell` mocked" — applies to `ContextView.test.tsx`.
  - `client/INSIGHTS.md` — "Update: skill → agent count … `ImportSkillDrawer` moved to `src/components/`" — this is the precedent for putting a component used by both the agent and skill editors in `client/src/components/<kebab>/` (a route may not import another route's `_components`).
  - `client/INSIGHTS.md` — "Nested `_components/` drift" — follow the parent-owned styles/constants pattern for nested children.
- Architecture / AGENTS.md rules:
  - Contract change = both `server/src/vendor/shared` and `client/src/vendor/shared`, with the same shape (root `AGENTS.md`). `reviewer-core` resolves `@devdigest/shared` to the **server** copy (`reviewer-core/tsconfig.json:22`).
  - Client `@devdigest/shared` is type-only: `import type` only (`client/AGENTS.md`).
  - Migrations come from `drizzle-kit generate` only. Never hand-write or edit (`AGENTS.md` "Do not touch").
  - DB-touching tests are `*.it.test.ts`. Hermetic tests never import `test/helpers/pg.ts`.
  - Wire fields are snake_case. Use `.nullish()` for optional-or-null and `.nullable()` for always-present-but-null.
  - Client: `data-<thing>` test hooks, strings in `client/messages/en/<ns>.json`, component folder layout, inline styles with CSS variables only.
  - `reviewer-core` stays pure: no fs, no new dependency (`reviewer-core/AGENTS.md`). `grounding.ts` is not touched.
  - Server: `routes.ts` never touches the DB or adapters. Services take narrow port deps, never `Container`. Only `platform/container.ts` constructs concrete classes.
- Do-not-touch items near this change:
  - `server/src/db/migrations/**` (only the new drizzle-kit output is added)
  - `server/clones/**`
  - `reviewer-core/src/grounding.ts`
  - lockfiles
  - the spec file
  - `server/src/modules/conventions/helpers.ts` (unguarded `readCloneFile`)
  - `client/src/vendor/ui/**` **except** `nav.ts` (see §6 R1)
  - `client/src/vendor/ui/primitives/Markdown.tsx` (reused as-is)
  - `mcp/**` (NFR12: MCP responses unchanged)

## 3. Skill assignments
| Step | Skills the executing agent must read | Rules from the skill that shape this step |
|---|---|---|
| 1 | `zod` | Contracts are PascalCase const + same-named `z.infer` type. Stored-JSON fields are `.nullish()` (root INSIGHTS). Request inputs use `.optional()` only. Wire is snake_case (root `AGENTS.md` Contracts). |
| 2 | `drizzle-orm-patterns`, `postgresql-table-design` | `pgTable('snake_case_plural')`, camelCase fields to snake columns, unique indexes suffixed `_uq` (root `AGENTS.md`). Add **manual FK indexes** ("PostgreSQL does not auto-index FK columns", postgresql-table-design Core Rules). Use `text`, not `varchar`, and NOT NULL where required. Migration via drizzle-kit only (skills README routing row). |
| 3 | `typescript-expert` (if the union type fights inference) | `reviewer-core/AGENTS.md`: pure, no new runtime dep, optional slots drop out. `reviewer-core/INSIGHTS.md`: no-`specs` output byte-identical, nothing added to the system message. |
| 4 | `onion-architecture`, `security`, `zod` | Cross-module ports go in `server/src/ports/` (onion Decision 1). Pure rules may live beside the port, like `ports/doc-fetcher.ts` `isDocUrlAllowed`. Parse env with zod at the boundary (`platform/config.ts`). Security A05/A01 path traversal: "Validate `path.resolve()` starts with" the root. Never build a `RegExp` from untrusted input without escaping, which here means escaping glob literals (security "Framework Security Quirks"). |
| 5 | `onion-architecture` (`references/tools.md` Adapters), `security` | Adapters live in `src/adapters/<topic>/`, implement a port, and "never import from `src/modules/**` … pass it as a constructor argument" (tools.md). Fail closed on every check (security A10). Do not follow symlinks while walking (pattern `repo-intel/pipeline/walk.ts:89`). |
| 6 | `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design` | Start from the core outward: `domain.ts` → `ports.ts` → `repository.ts` (onion Workflow). Domain errors subclass `AppError`. The repository implements the port, returns domain types not `$inferSelect`, and filters by workspace (tools.md "Workspace scoping is a repository invariant"). The Drizzle `tx` never leaves the repository. |
| 7 | `onion-architecture`, `fastify-best-practices`, `zod`, `security` | A route parses with Zod, calls one service method and shapes the reply. `getContext` stays in routes (tools.md). The service takes a narrow deps object, never `Container`. Wire it in `container.ts` and add one import + one entry in `modules/index.ts` (onion Create step 4). New endpoints sit under the global rate limit (security A06; `server/src/app.ts:111`). |
| 8 | `onion-architecture`, `security` | Module A imports only module B's `ports.ts`/`domain.ts` (onion checklist HIGH). Logs are metadata only (security A09; server INSIGHTS "Prompt logs are metadata-only"). |
| 9 | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` | One data path: `lib/api.ts` → `lib/hooks/*` → component. Never call `fetch` in a component (this-repo.md "One data path"). Server data stays in TanStack Query, not `useState` (SKILL "Server data is not component state"). Shared contract types are type-only. |
| 10 | `frontend-ui-architecture` | `vendor/ui` is normally do-not-touch. This is the one spec-mandated exception (§6 R1). Nav keys and labels must match `shell.json` `nav.context`. |
| 11 | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `security` | Lowercase route segment, thin `"use client"` `page.tsx`, view in `_components/<Pascal>/` with `styles.ts` (`export const s`) + `index.ts` (named + default). Nested `_components/` children use the parent's styles/helpers and a named-only `index.ts` (this-repo.md). Every string goes in i18n. XSS: no `dangerouslySetInnerHTML` and no `rehype-raw`, and `javascript:` hrefs are rejected (security A05 XSS). |
| 12 | `frontend-ui-architecture`, `react-best-practices` | Used by two unrelated route features, so it goes in the shared layer `client/src/components/<kebab-case>/` with a PascalCase file (SKILL placement table; client INSIGHTS ImportSkillDrawer precedent). Derive counts and token sums during render instead of storing them (SKILL "Derive instead of storing"). |
| 13 | `frontend-ui-architecture`, `react-best-practices` | Nested `_components/ContextTab/` child: `ContextTab.tsx` + named-only `index.ts`, no own styles. Use `useActiveRepo()`. Do not re-derive the repo from the pathname (this-repo.md). |
| 14 | `frontend-ui-architecture`, `react-best-practices` | Same as Step 13, for `SkillEditor`. |
| 15 | `frontend-ui-architecture`, `react-best-practices` | A child with its own expand state gets its own folder under `RunTraceDrawer/_components/` (this-repo.md: "Anything with state, a handler or a branch gets a folder"; `ToolCallRow` "owns its own expand state"). Styles go in `RunTraceDrawer/styles.ts`. |
| tests | `react-testing-library` (client), `onion-architecture` `references/testing.md` (server), `spec-writing` `references/ears.md` (Verify-by lanes) | Use fakes for ports, not `vi.mock`. Repositories are tested in `*.it.test.ts`. RTL tests assert on behaviour with role/label queries. |

## 4. Steps

### Step 1 — Contracts in both vendored `shared` copies  (package: server + client vendor)
- Covers: AC13, AC14, NFR12 (contract shapes); prerequisite of Steps 3–15
- Files:
  - `server/src/vendor/shared/contracts/platform.ts` — add the project-context contracts after `SpecFile`/`IndexStatus` (`:274-289`). Keep `SpecFile` and `IndexStatus`.
  - `client/src/vendor/shared/contracts/platform.ts` — the same, identical shape (anchor `:275`).
  - `server/src/vendor/shared/contracts/trace.ts` — add `ProjectContextEntry` and `RunTrace.project_context`.
  - `client/src/vendor/shared/contracts/trace.ts` — the same (anchor `specs_read` at `:93`; the copies have drifted by one line).
- Context:
  - `RunTrace` is at `server/src/vendor/shared/contracts/trace.ts:80-97`, with `specs_read: z.array(z.string())` at `:94`.
  - `PromptAssembly.specs` (`:47`) stays unchanged.
  - Both `index.ts` files re-export `./contracts/platform.js` and `./contracts/trace.js` (`server/src/vendor/shared/index.ts:21-22`), so no index edit is needed.
  - Pattern for a nullish stored-JSON field: `RunStats.cost_usd` comment at `trace.ts:71-73`.
- Change (shapes from the spec's Contracts section):
  - `ProjectContextDoc = z.object({ path: z.string(), type: z.string(), size_bytes: z.number().int(), tokens: z.number().int(), used_by_agents: z.number().int(), updated_at: z.string().nullish() })`
  - `ProjectContextList = { docs: ProjectContextDoc[], total_tokens: int, search_roots: string[], truncated: boolean }`
  - `ProjectContextFile = ProjectContextDoc.extend({ content: z.string() })`
  - `ContextAttachments = { repo_id: string, paths: string[], missing: string[] }`
  - `ContextAttachmentsInput = { repo_id: z.string().min(1), paths: z.array(z.string().min(1)) }`. Count and duplicate checks are **not** in the schema (§0: keep 400).
  - `ContextAttachmentsSaved = { repo_id, paths }`
  - `trace.ts`:
    - `ProjectContextStatus = z.enum(['included','missing','rejected','over_limit'])`
    - `ProjectContextEntry = { path: string, origin: z.enum(['agent','skill']), skill_name: string.nullish(), status: ProjectContextStatus, tokens: int.nullable(), text: string.nullable() }`
    - `RunTrace.project_context: z.array(ProjectContextEntry).nullish()`
- Skills: `zod` — PascalCase const + same-named infer type; nullish for stored JSON.
- Done when: `.claude/scripts/check-changed.sh server client` passes typecheck, and both copies carry byte-identical new blocks (diff the two inserted regions).
- Depends on: —
- Agent: implementer — Phase: 1

### Step 2 — Attachment tables + generated migration  (package: server)
- Covers: prerequisite of Steps 6–8 (for AC4, AC6, AC8, AC9; EC14 via cascade)
- Files:
  - `NEW server/src/db/schema/project-context.ts`
  - `server/src/db/schema.ts` — add `export * from './schema/project-context'` beside `:15-27`, import both tables and add them to the `schema` object (`:50-93`).
  - `NEW server/src/db/migrations/0015_<drizzle-kit name>.sql` + `meta/0015_snapshot.json` + `_journal.json` entry, all **generated**.
- Context:
  - Join-table pattern: `agentSkills` at `server/src/db/schema/agents.ts:51-63`.
  - Unique index pattern: `uniqueIndex('repos_ws_fullname_uq')` at `server/src/db/schema/repos.ts:22`.
  - Index pattern: `index('code_chunks_repo_idx')` at `server/src/db/schema/context.ts:46`.
  - `now()` helper from `./_shared`.
  - Tables to reference: `agents` (`schema/agents.ts:8`), `skills` (`schema/skills.ts:5`), `repos` (`schema/repos.ts:5`).
  - Latest migration is `0014_soft_susan_delgado.sql`.
- Change:
  - `agentContextDocs = pgTable('agent_context_docs', { id: uuid pk defaultRandom, agentId: uuid('agent_id') notNull FK agents.id onDelete cascade, repoId: uuid('repo_id') notNull FK repos.id onDelete cascade, path: text notNull, position: integer notNull, createdAt: now() })`
  - Indexes on `agentContextDocs`: `uniqueIndex('agent_context_docs_agent_repo_path_uq').on(agentId, repoId, path)` and `index('agent_context_docs_repo_idx').on(repoId, path)` (for the `used_by_agents` lookup and the FK).
  - `skillContextDocs` is the same with `skillId` → `skills.id` cascade: `skill_context_docs_skill_repo_path_uq` and `skill_context_docs_repo_idx`.
  - No content column (AC6). Generate with `cd server && ./node_modules/.bin/drizzle-kit generate --name project_context_docs` (offline, needs no DB).
- Skills: `drizzle-orm-patterns`, `postgresql-table-design` — `_uq` suffix, manual FK index, text, NOT NULL.
- Done when:
  - Exactly one new `.sql` file and its snapshot/journal entry exist, and the SQL creates both tables with `ON DELETE cascade` FKs and the four indexes.
  - Server typecheck passes.
  - No existing migration file is modified (`git diff --stat server/src/db/migrations` shows only additions).
- Depends on: —
- Agent: implementer — Phase: 1

### Step 3 — reviewer-core: path-labelled spec entries + label escaping  (package: reviewer-core)
- Covers: AC9, AC12, NFR7, EC16, EC17 (and supports AC15)
- Files:
  - `reviewer-core/src/prompt.ts`
  - `reviewer-core/src/review/run.ts`
  - `reviewer-core/src/index.ts` — export the new type next to `type PromptParts` (`:15-25`).
- Context:
  - `wrapUntrusted(label, content)` at `reviewer-core/src/prompt.ts:32-35` escapes only the content.
  - `PromptParts.specs?: string[]` is at `:140`.
  - Positional labelling: `parts.specs.map((s, i) => wrapUntrusted(\`spec-${i}\`, s))` at `:197-200`.
  - The section is pushed at `:222`.
  - `ReviewInput.specs?: string[]` is at `reviewer-core/src/review/run.ts:61`. `promptParts.specs: input.specs` is at `:138`. It is re-sent per chunk at `:177` (EC10).
  - `assembleConventionScanPrompt` also calls `wrapUntrusted(f.path, …)` at `:300`, and the server calls `wrapUntrusted(\`skill:${name}\`, …)` at `server/src/modules/reviews/helpers.ts:32`. Both inherit the escaping.
- Change:
  - Add `export type SpecEntry = string | { label: string; text: string }`.
  - Change `PromptParts.specs` and `ReviewInput.specs` to `SpecEntry[]`.
  - A string entry keeps the `spec-${i}` label (byte-identical for current callers). An object entry uses `label`.
  - `wrapUntrusted` HTML-escapes the label: `&`→`&amp;`, `"`→`&quot;`, `<`→`&lt;`, `>`→`&gt;`, CR/LF→`&#13;`/`&#10;`. Labels without these characters are unchanged. Content escaping is unchanged.
  - No change to the system message, `INJECTION_GUARD`, `buildScopePolicy` or `grounding.ts`. OQ10 is out of scope.
- Skills: none mandatory (`typescript-expert` if needed) — rules: purity, no dependency, no-specs output byte-identical (`reviewer-core/INSIGHTS.md`).
- Done when:
  - `.claude/scripts/check-changed.sh reviewer-core` passes.
  - Existing `reviewer-core/test/prompt.test.ts` and `run.test.ts` stay green unchanged.
  - Server typecheck (which compiles reviewer-core source) passes.
- Depends on: 1 (PromptAssembly unchanged; only ordering)
- Agent: implementer — Phase: 2

### Step 4 — Search-root config + `ProjectDocs` port with pure path rules  (package: server)
- Covers: AC1 (roots), AC5, NFR1 (syntax part), EC17; prerequisite of Steps 5–8
- Files:
  - `server/src/platform/config.ts`:
    - `EnvSchema` (`:15-45`): add `PROJECT_CONTEXT_ROOTS: z.string().optional()`.
    - `AppConfig` (`:47-74`): add `projectContextRoots: string[]`.
    - `loadConfig` (`:94-119`): split on `;`, trim and drop empties. The default is `['**/{specs,docs,insights}/**/*.md']`. Use `;` because the default glob contains commas.
  - `server/.env.example` — add a commented `PROJECT_CONTEXT_ROOTS=` line near `DEVDIGEST_CLONE_DIR` (`:35`).
  - `NEW server/src/ports/project-docs.ts`
- Context:
  - Pattern for a port plus pure rules in core: `server/src/ports/doc-fetcher.ts` (`DOC_MAX_BYTES`, `isDocUrlAllowed`, `interface DocFetcher`).
  - `RepoRef` comes from `@devdigest/shared` (`server/src/vendor/shared/adapters.ts`, used by `GitClient.clonePathFor(repo: RepoRef)` at `:227`).
  - Token estimate convention: `Math.ceil(text.length / 4)` (`server/src/platform/trace-builder.ts:64-66`).
- Change (pure functions + types only, no fs):
  - Constants: `CONTEXT_DOC_MAX_BYTES = 65_536`, `CONTEXT_RUN_MAX_TOKENS = 24_000`, `CONTEXT_LIST_MAX_DOCS = 500`, `CONTEXT_MAX_ATTACHMENTS = 50`, `CONTEXT_SCAN_MAX_FILES = 5_000` (equals `MAX_INDEXED_FILES`, `server/src/modules/repo-intel/constants.ts:42`).
  - `globToRegExp(glob: string): RegExp` — supports only `**`, `*` and `{a,b}`. Escape every other regex metacharacter. `**/` matches zero or more whole segments, so `specs/a.md` matches the default root. `*` never crosses `/`. Anchored `^…$`.
  - `matchesRoots(path, roots): boolean`
  - `docTypeFor(path, roots): string` — the folder **nearest the file** among the literal folder names in the roots (with `{a,b}` alternatives expanded), so `docs/specs/x.md` → `specs` (P18). Fallback: the first directory segment.
  - `checkContextPathSyntax(path): boolean` — reject:
    - empty paths
    - absolute paths (`/…`)
    - drive-letter paths (`^[A-Za-z]:`)
    - any `\`
    - any `..` segment
    - NUL or any control character (`\x00-\x1f`, `\x7f`)
    - any `%` (this blocks `specs/%2e%2e/x.md`; see §6 R5)
  - `estimateTokens(text)`.
  - `interface ProjectDocsPort`:
    - `list(repo: RepoRef): Promise<{ kind: 'ok'; docs: ScannedDoc[]; truncated: boolean } | { kind: 'clone_unavailable' }>`
    - `read(repo: RepoRef, path: string): Promise<DocRead>`, where `DocRead = { kind: 'ok'; text; sizeBytes; updatedAt } | { kind: 'invalid' | 'missing' | 'too_large' | 'not_utf8' | 'clone_unavailable' }`
    - `exists(repo, path): Promise<'ok' | 'missing' | 'invalid' | 'clone_unavailable'>` — validates and stats only, never reads content.
    - `ScannedDoc = { path; type; sizeBytes; tokens; updatedAt }`
    - `roots: readonly string[]`
- Skills: `onion-architecture` (port in `src/ports/`, no runtime zod in core), `security` (fail closed, escape regex), `zod` (env parse at the boundary).
- Done when: server typecheck passes, and `check.sh` shows no new violations (`ports/project-docs.ts` imports only `type` from `@devdigest/shared`).
- Depends on: —
- Agent: implementer — Phase: 3

### Step 5 — Filesystem adapter for project docs  (package: server)
- Covers: AC1, AC3 (read), AC5, NFR1, NFR2, NFR4, NFR6, EC3, EC7, EC9, EC18
- Files:
  - `NEW server/src/adapters/project-docs/fs-project-docs.ts`
  - `server/src/adapters/index.ts` — add one export line like `HttpDocFetcher` (the barrel is consumed at `server/src/platform/container.ts:18-27`).
- Context:
  - Walk pattern to copy: `server/src/modules/repo-intel/pipeline/walk.ts:73-110`, which uses `readdir(dir, { withFileTypes: true })`, skips symlinks at `:89` and skips `EXCLUDED_SET` dirs at `:93`.
  - Containment pattern: `server/src/adapters/git/simple-git.ts:61-70` (`clonePathFor`) and `:207-215` (`readFile`).
  - `EXCLUDED_DIRS` is at `server/src/modules/repo-intel/constants.ts:17-26`. The adapter **must not import it** (tools.md "adapters never import from `src/modules/**`"). It is passed in by the container.
- Change:
  - `class FsProjectDocs implements ProjectDocsPort`
  - Constructor: `{ clonePathFor: (r: RepoRef) => string; roots: readonly string[]; excludedDirs: readonly string[]; maxVisitedFiles: number; readFile?: (p: string) => Promise<Buffer> }`. The optional `readFile` is the test seam that lets a spy prove no read happens outside the clone.
  - `list`:
    - clone root missing → `clone_unavailable`
    - recursive walk, never following symlinks and skipping `excludedDirs`; stop after `maxVisitedFiles` entries
    - keep `.md` files whose repo-relative `/` path passes `checkContextPathSyntax` and `matchesRoots`
    - for each kept file: `stat` gives `sizeBytes` and `updatedAt`; read UTF-8 to compute `tokens`
    - sort by path; cut at `CONTEXT_LIST_MAX_DOCS` → `truncated`
  - `read`, in this order, with no content read before all checks pass:
    1. syntax check
    2. `realpath` of the clone root and of the target (ENOENT → `missing`)
    3. resolved target inside the resolved root
    4. resolved repo-relative path passes `matchesRoots`, has no excluded dir, and ends in `.md`, else `invalid` (this covers a symlink to `src/secret.md`, EC7)
    5. `stat` size over `CONTEXT_DOC_MAX_BYTES` → `too_large`
    6. read the buffer and decode with `new TextDecoder('utf-8', { fatal: true })` → `not_utf8` on throw
  - `exists`: steps 1–4 only.
- Skills: `onion-architecture` (adapter at the edge, constructor-injected constants), `security` (traversal, symlink escape, fail closed).
- Done when: server typecheck passes and `check.sh` reports no new violations.
- Depends on: 4
- Agent: implementer — Phase: 3

### Step 6 — `project-context` module core: domain, ports, repository  (package: server)
- Covers: AC4, AC6, AC8, AC9 (ordering), AC10, AC11, AC13 (entries), EC4, EC11, EC12, EC13, EC14
- Files:
  - `NEW server/src/modules/project-context/domain.ts`
  - `NEW server/src/modules/project-context/ports.ts`
  - `NEW server/src/modules/project-context/repository.ts`
- Context:
  - Module ports pattern: `server/src/modules/blast/ports.ts:1-22`.
  - Error base: `AppError(code, message, statusCode, details)` at `server/src/platform/errors.ts:7-17`.
  - Workspace-scoped lookups to mirror: `AgentsRepository.getById(workspaceId, id)` (`server/src/modules/agents/repository.ts:65`), `SkillsRepository.getById` (`server/src/modules/skills/repository.ts:88`) and `RepoRepository.getById` (`server/src/modules/repos/repository.ts:36`). The new repository runs its own queries on `t.agents`, `t.skills`, `t.repos` and `t.agentSkills`. It never imports those repositories.
  - Skill link order: `agentSkills.order` (`server/src/db/schema/agents.ts:60`).
- Change:
  - `domain.ts`:
    - Errors, each subclassing `AppError`:
      - `ContextPathInvalidError` (400 `context_path_invalid`)
      - `CloneUnavailableError` (409 `clone_unavailable`)
      - `ContextDocNotFoundError` (404 `context_doc_not_found`)
      - `ContextDocTooLargeError` (413 `context_doc_too_large`)
      - `RepoNotFoundError` (404 `repo_not_found`)
      - `AttachmentLimitError` (400 `validation_error`, for more than 50 paths or duplicates)
    - Pure `orderCandidates(agentPaths: string[], skills: { name: string; paths: string[] }[]): Candidate[]` — agent paths in attach order, then each skill in the given order; dedupe by path, keeping the first occurrence (EC11). `Candidate = { path; origin: 'agent' | 'skill'; skillName: string | null }`.
    - Pure `buildProjectContext(candidates, reads: Map<path, DocRead>)` → `{ specs: { label: path; text }[]; entries: ProjectContextEntry[]; specsRead: string[]; includedTokens: number }`. Status mapping:
      - `ok` within both caps → `included`, `tokens = ceil(chars/4)`, `text` = the exact text
      - `too_large` → `over_limit` (NFR2)
      - running total + tokens > `CONTEXT_RUN_MAX_TOKENS` → `over_limit`, then continue with the next doc (AC11, NFR3)
      - `missing` / `clone_unavailable` → `missing`
      - `invalid` / `not_utf8` → `rejected`
      - non-included entries get `tokens: null, text: null` (AC10)
  - `ports.ts`:
    - `ProjectContextRepositoryPort`:
      - `findRepo(ws, repoId) → { id, owner, name } | null`
      - `agentExists(ws, id)`, `skillExists(ws, id)`
      - `listPaths(kind: 'agent' | 'skill', ownerId, repoId): string[]` — ordered by `position`
      - `replacePaths(kind, ownerId, repoId, paths)` — delete + insert in one repository-internal transaction, scoped to that repo only (AC6 "other repo returns []")
      - `usedByAgents(repoId): Map<string, number>` — count DISTINCT agent ids, `agent_context_docs` UNION (`skill_context_docs` JOIN `agent_skills` on skill_id); no enabled filter (§0 gap, §6 R4)
      - `skillPaths(skillIds: string[], repoId): Map<skillId, string[]>`
    - `ProjectContextRunPort` (consumed by `reviews/run-executor.ts`): `resolveForRun(input: { workspaceId; repo: { id; owner; name }; agentId; skills: { id; name }[] }): Promise<ProjectContextForRun>`, where `ProjectContextForRun = { specs: { label; text }[]; entries: ProjectContextEntry[]; specsRead: string[]; includedTokens: number }`. Uses `import type` from `@devdigest/shared`.
  - `repository.ts`: `class ProjectContextRepository implements ProjectContextRepositoryPort` (Drizzle, `Db` in the constructor). It returns plain domain shapes and never touches `agents.version` or `skills.version` (AC6, AC8, NG3).
- Skills: `onion-architecture` (core first, errors in domain, port implemented by the repository, workspace filter), `drizzle-orm-patterns`, `postgresql-table-design`.
- Done when: server typecheck passes and `check.sh` reports no new violations (`domain.ts`/`ports.ts` import nothing from drizzle, `src/db` or adapters).
- Depends on: 1, 2, 4
- Agent: implementer — Phase: 3

### Step 7 — Service, routes, container wiring, module registration  (package: server)
- Covers: AC1, AC3, AC4, AC5, AC6, AC8, EC1, EC3, EC4, EC13, EC21, NFR4, NFR5 (global rate limit)
- Files:
  - `NEW server/src/modules/project-context/service.ts`
  - `NEW server/src/modules/project-context/routes.ts`
  - `server/src/modules/index.ts` — one import + one `projectContext` entry (`:1-43`).
  - `server/src/platform/container.ts`:
    - `ContainerOverrides` (`:59-75`): add `projectDocs?: ProjectDocsPort`.
    - Add a private field and a `get projectDocs(): ProjectDocsPort` that builds `new FsProjectDocs({ clonePathFor: (r) => this.git.clonePathFor(r), roots: this.config.projectContextRoots, excludedDirs: EXCLUDED_DIRS, maxVisitedFiles: CONTEXT_SCAN_MAX_FILES })`, following the `docFetcher` pattern at `:220-223`.
    - Add `get projectContextService()` that builds `new ProjectContextService({ repo: new ProjectContextRepository(this.db), docs: this.projectDocs })`.
    - Import `EXCLUDED_DIRS` from `../modules/repo-intel/constants.js`, **not** the barrel.
- Context:
  - Route pattern to copy: `server/src/modules/blast/routes.ts:1-24` (`withTypeProvider<ZodTypeProvider>()`, `getContext(container, req)`, `IdParams` from `../_shared/schemas.js`, service from the container).
  - Service pattern: `server/src/modules/blast/service.ts:6-37` (deps object, `NotFoundError`, metadata-only log).
  - Error envelope: `server/src/app.ts:131-178` (`AppError` → `{ error: { code, message, details } }`; zod → 422).
- Change:
  - Routes (Zod-parsed):
    - `GET /repos/:id/context` → `ProjectContextList`
    - `GET /repos/:id/context/file` with querystring `{ path: z.string() }` → `ProjectContextFile`
    - `GET /agents/:id/context` and `GET /skills/:id/context` with querystring `{ repo_id: z.string().min(1) }` → `ContextAttachments`
    - `PUT /agents/:id/context` and `PUT /skills/:id/context` with body `ContextAttachmentsInput` → `ContextAttachmentsSaved`
  - Service `ProjectContextService` (deps `{ repo: ProjectContextRepositoryPort; docs: ProjectDocsPort }`):
    - `listDocs(ws, repoId)` — repo or 404 `repo_not_found`; `docs.list` gives `clone_unavailable` → 409; merge `usedByAgents`; `total_tokens` = sum; `search_roots = docs.roots`.
    - `getDoc(ws, repoId, path)` — syntax/roots invalid → 400 **before any fs call**; `read` maps `invalid`/`not_utf8` → 400 `context_path_invalid` (EC18 preview error), `missing` → 404, `too_large` → 413, `clone_unavailable` → 409.
    - `getAttachments(kind, ws, ownerId, repoId)` — owner + repo in the workspace or 404; `missing` = paths whose `docs.exists` ≠ `ok` (EC4, OQ6).
    - `setAttachments(kind, ws, ownerId, input)` — owner + repo or 404. Then:
      - more than 50 paths or duplicates → `AttachmentLimitError`
      - each path: `checkContextPathSyntax` + `matchesRoots`, and if it exists on disk, `docs.exists` must not be `invalid` → else 400 `context_path_invalid`
      - a non-existent path is accepted so the user can keep a "missing" row (EC4)
      - `replacePaths`; returns `{ repo_id, paths }`
    - `resolveForRun(...)` implements `ProjectContextRunPort`: repo attachments for the agent + `skillPaths` for the given skills in order → `orderCandidates` → `docs.read` each → `buildProjectContext`.
  - Log metadata (counts and ids) only, never paths' content.
- Skills: `onion-architecture`, `fastify-best-practices`, `zod`, `security`.
- Done when: server typecheck passes, `check.sh` reports no new violations, and the routes appear in `app.printRoutes()` (or a manual `app.inject` returns 404 `repo_not_found` for an unknown id).
- Depends on: 5, 6
- Agent: implementer — Phase: 3

### Step 8 — Run executor integration + trace  (package: server)
- Covers: AC9, AC10, AC11, AC12, AC13, EC5, EC6, EC10, EC12, EC19, EC20, NFR5, NFR9 (and the trace half of AC15)
- Files:
  - `server/src/modules/reviews/run-executor.ts`
  - `server/src/modules/reviews/service.ts` — `:37` passes `container.projectContextService` as the new 5th constructor argument.
  - `server/test/prompt-log-executor.test.ts` — only `:49`: pass a no-op fake `{ resolveForRun: async () => ({ specs: [], entries: [], specsRead: [], includedTokens: 0 }) }` so the existing hermetic suite stays green. This is a keep-green edit, not new coverage.
- Context:
  - Constructor at `run-executor.ts:63-68`.
  - Linked skills at `:239-244`: `linkedSkills(agent.id)` returns `{ skill, order }[]` ordered by `agent_skills.order` (`server/src/modules/agents/repository.ts:192-200`). `buildSkillNames` keeps enabled skills only (`server/src/modules/reviews/helpers.ts:14-16`), so pass `linkedSkills.filter(l => l.skill.enabled).map(l => ({ id: l.skill.id, name: l.skill.name }))` to match `skills_used` (EC12).
  - `reviewPullRequest({...})` at `:250-277` uses the omit-when-empty spread pattern (`...(skillTexts.length > 0 ? { skills: skillTexts } : {})`).
  - The repo-intel gate at `:217` must **not** gate this (EC19).
  - `prompt.assembled` log at `:282-306`.
  - Trace literal at `:353-397`, with `specs_read: []` at `:393`.
  - Failure trace at `:522-546` stays `specs_read: []` with no `project_context` (EC20).
  - Import only `type { ProjectContextRunPort }` from `../project-context/ports.js`.
- Change:
  - New constructor param `private projectContext: ProjectContextRunPort`.
  - After the skills block, call `resolveForRun({ workspaceId, repo: { id: repo.id, owner: repo.owner, name: repo.name }, agentId: agent.id, skills })`.
  - Pass `...(pc.specs.length > 0 ? { specs: pc.specs } : {})`, which keeps AC12 byte-identical with no attachments.
  - Live Log:
    - one `runLog.info` line per non-included entry: `project context: skipped <path> (<status>)`
    - then exactly one line: `project context: {included} included, {skipped} skipped (~{tokens} tokens)` (NFR9)
    - no text in any line
  - Add `project_context_docs: { included, skipped }` counts to the pino `prompt.assembled` object. No paths and no text.
  - Trace: `specs_read: pc.specsRead` (included paths in prompt order); `project_context: pc.entries.length > 0 ? pc.entries : null`.
  - A failure inside `resolveForRun` must not fail the run. Wrap it like `buildRepoMapDigest` (`:478-491`): on error log an info line and treat it as no context.
- Skills: `onion-architecture` (cross-module import via `ports.ts` only), `security` (A09 metadata-only logs).
- Done when:
  - `.claude/scripts/check-changed.sh server` passes, with `prompt-log-executor.test.ts` green.
  - `check.sh` shows no new violation (run-executor's `Container` import is already baselined; do not add new ones).
  - Then `check-changed.sh server --full`.
- Depends on: 3, 7
- Agent: implementer — Phase: 3

### Step 9 — Client data hooks + types  (package: client)
- Covers: prerequisite of Steps 11–14 (AC2, AC3, AC4, AC6, AC7, AC8)
- Files:
  - `NEW client/src/lib/hooks/context.ts`
  - `client/src/lib/hooks/index.ts` — add `export * from "./context";` (`:4-12`).
  - `client/src/lib/hooks/core.ts` — remove `useContextFiles`/`useReindexContext` (`:122-137`) and the now-unused `SpecFile`/`IndexStatus` imports (`:18-19`). Nothing else uses them (grep shows only `core.ts`).
  - `client/src/lib/types.ts` — add the new contract types to the type-only re-export (`:11-32`).
- Context:
  - Hook pattern: `useAgentSkills`/`useSetAgentSkills` at `client/src/lib/hooks/agents.ts:93-110`.
  - `api.get/put` come from `client/src/lib/api.ts` (`api.put` is used at `core.ts:33`).
- Change:
  - `useContextDocs(repoId)` → key `["context", repoId]`
  - `useContextDoc(repoId, path)` → key `["context-doc", repoId, path]`, enabled when both are set; encode `path` with `encodeURIComponent`
  - `useAgentContext(agentId, repoId)` / `useSetAgentContext(agentId, repoId)` → `PUT /agents/:id/context`, invalidates `["agent-context", agentId, repoId]` and `["context", repoId]` (used_by changes)
  - `useSkillContext` / `useSetSkillContext` — the same for skills
  - Types are imported with `import type` only.
- Skills: `frontend-ui-architecture` (one data path, global hooks in `lib/hooks/`), `react-best-practices`.
- Done when: `.claude/scripts/check-changed.sh client` typecheck passes.
- Depends on: 1
- Agent: implementer — Phase: 4

### Step 10 — Sidebar nav entry  (package: client)
- Covers: AC2 (nav item)
- Files: `client/src/vendor/ui/nav.ts` — WORKSPACE group (`:21-27`): add `{ key: "context", label: "Project Context", icon: "FileText", href: "/repos/:repoId/context" }` after `pulls`. No `gKey`, because `c` is taken by Conventions (`:33`).
- Context:
  - `Sidebar` reads `NAV` directly (`client/src/vendor/ui/shell/Sidebar.tsx:3,45`).
  - The i18n label `nav.context` already exists (`client/messages/en/shell.json:20`).
  - The active key `context` already exists (`client/src/components/app-shell/helpers.ts:30`).
  - `FileText` is a valid `IconName` (used at `TraceBody.tsx:74`).
  - The existing assertion `expect(keysOf("WORKSPACE")).toEqual(["pulls"])` (`client/src/components/app-shell/nav.test.tsx:11`) will change. That test edit belongs to test-writer, but the implementer may update this one line to keep the suite green.
- Change: one array entry.
- Skills: `frontend-ui-architecture` (vendored exception, §6 R1).
- Done when: client typecheck passes and the sidebar shows "Project Context" under WORKSPACE.
- Depends on: —
- Agent: implementer — Phase: 4

### Step 11 — Project Context page  (package: client)
- Covers: AC2, AC3, AC4, EC1, EC3, EC9, EC15, EC18, EC21, NFR8, NFR10, NFR11, NG2
- Files:
  - `NEW client/src/app/repos/[repoId]/context/page.tsx`
  - `NEW client/src/app/repos/[repoId]/context/_components/ContextView/` — `ContextView.tsx`, `styles.ts`, `constants.ts`, `helpers.ts`, `index.ts`
  - `NEW …/ContextView/_components/DocList/` — `DocList.tsx`, `index.ts`
  - `NEW …/ContextView/_components/DocPreview/` — `DocPreview.tsx`, `index.ts`
  - `client/messages/en/context.json` — rewrite for this page:
    - drop the `chunks`, `reindex`, `indexing`, `mode.edit` and `editor.*` keys (no consumers outside `vendor`; grep found none)
    - add `footer` = `"{files} files · {tokens} tokens total"`, `usedBy` = `"Used by {count} agents"`, `rescan`, `truncated`, `cloneUnavailable`, `retry`, `previewError`, `selectDoc`
    - `empty.body` names the active roots via a `{roots}` param (EC1)
- Context:
  - Thin page pattern: `client/src/app/repos/[repoId]/conventions/page.tsx:1-9`.
  - View pattern (AppShell, loading/error/empty, `useRepoNotFound`): `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/ConventionsView.tsx`.
  - `useRepoNotFound` is at `client/src/lib/repo-context.tsx:69-72`.
  - Markdown renderer: `Markdown` from `@devdigest/ui` (`client/src/vendor/ui/primitives/Markdown.tsx:6-42`; react-markdown with `remark-gfm`, no `rehype-raw`).
  - `ErrorState`, `EmptyState`, `Badge` and `Skeleton` are exported from `@devdigest/ui` (`client/src/vendor/ui/primitives/index.ts`).
- Change:
  - Left list: one row per doc (`data-context-doc={path}`) with the path truncated, the full path in `title` (EC15), a text type `Badge` and `~N tok`.
  - Footer from `context.footer`, with `tokens` = `total_tokens`.
  - A `truncated` banner (EC9).
  - The toolbar has only a rescan button (`refetch()`; P8).
  - Right preview: `GET …/context/file` → header with path, type and "Used by {count} agents", then `<Markdown>{content}</Markdown>`.
  - No textbox and no Edit/New/Upload/Save controls (AC3, NG2).
  - 409 → `ErrorState` with retry (EC3). 413 or 400 → preview error message (EC18, NFR2).
  - On 429 keep the last list (TanStack Query keeps `data`) and show the retry message (EC21).
  - Strings go in `context.json` only (NFR11).
- Skills: `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `security` (no `dangerouslySetInnerHTML`, no `rehype-raw`).
- Done when: client typecheck passes and the route renders in `next dev` with a list and a preview for a cloned repo (manual smoke).
- Depends on: 9, 10
- Agent: implementer — Phase: 4

### Step 12 — Shared ContextDocPicker  (package: client)
- Covers: AC7, AC8 (UI part), EC2, EC4, EC10, EC15, NFR10, NFR11, NG9
- Files:
  - `NEW client/src/components/context-doc-picker/` — `ContextDocPicker.tsx`, `styles.ts`, `helpers.ts`, `index.ts` (named + default)
  - `NEW …/context-doc-picker/_components/DocPreviewPanel/` — `DocPreviewPanel.tsx`, `index.ts` (named only). It uses `useContextDoc` + `Markdown`.
  - `client/messages/en/context.json` — add a `picker.*` block: `attachedOfTotal` = `"{attached} of {total} attached"`, `attachedCount` = `"{attached} attached"`, `footerTokens` = `"≈ {tokens} tokens per prompt"` (EC10), `filterLabel`, `filterPlaceholder`, `noMatch`, `clearFilter`, `missing`, `preview`, `closePreview`.
- Context:
  - Row/filter/list patterns: `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:101-173`. Copy the layout only, **not** the drag/reorder code (`:32-33`, `:88-95`, `:131-161`; NG9).
  - `TextInput` comes from `@devdigest/ui` (used at `SkillsTab.tsx:123`).
  - There is no Checkbox primitive (`client/src/vendor/ui/primitives/index.ts`), so use a native `<input type="checkbox">`.
- Change:
  - Props: `{ repoId: string; docs: ProjectContextDoc[]; attached: string[]; missing: string[]; onChange(next: string[]): void; saving: boolean; header: 'ofTotal' | 'count' }`.
  - Rows: docs plus missing attached paths shown as checked rows labelled "missing" (EC4).
  - Each row has a native checkbox with `aria-label={path}`, the path (truncated, `title`), a text type badge, and a Preview icon button with a text accessible name (`aria-label`, ≥24×24 px).
  - The filter input has a `<label>`. When nothing matches, show "no match" and a clear-filter button (EC2).
  - Header count and token footer sit in one `aria-live="polite"` region.
  - Token sum = sum of `tokens` over attached docs present in `docs` (helper `sumAttachedTokens`, pure).
  - Toggle appends to or removes from the attach order (helper `toggleAttached`, pure) and calls `onChange` with the full list. That is one PUT per change, last save wins (EC13).
  - Hooks: `data-context-row={path}` and `data-context-missing`.
- Skills: `frontend-ui-architecture` (shared kebab folder, pure helpers in `helpers.ts`), `react-best-practices` (derive, do not store).
- Done when: client typecheck passes.
- Depends on: 9
- Agent: implementer — Phase: 4

### Step 13 — Agent editor Context tab  (package: client)
- Covers: AC6 (client save), AC7
- Files:
  - `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` — add `{ key: "context", labelKey: "editor.tabs.context", icon: "FileText" }` to `TABS` (`:11-14`).
  - `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` — the `:28` ternary becomes three branches.
  - `NEW …/AgentEditor/_components/ContextTab/ContextTab.tsx` + `index.ts` (named only)
  - `client/messages/en/agents.json` — add `editor.tabs.context` (`:49-53` block) and an `editor.context.*` title/hint/noRepo.
- Context:
  - `useActiveRepo()` returns `{ repoId, activeRepo }` (`client/src/lib/repo-context.tsx:58-60`).
  - Tab rendering is at `AgentEditor.tsx:15-31`.
- Change: `ContextTab` reads `repoId` from `useActiveRepo()` (no repo → `EmptyState` with `editor.context.noRepo`), loads `useContextDocs` + `useAgentContext`, and renders `ContextDocPicker header="ofTotal"` with `onChange` → `useSetAgentContext.mutate({ repo_id, paths })`.
- Skills: `frontend-ui-architecture`, `react-best-practices`.
- Done when: client typecheck passes and the Context tab shows on `/agents/:id?tab=context`.
- Depends on: 12
- Agent: implementer — Phase: 4

### Step 14 — Skill editor "Project context to use"  (package: client)
- Covers: AC8
- Files:
  - `client/src/app/skills/[id]/_components/SkillEditor/constants.ts` — add a `context` tab (`:10-15`, `labelKey: "editor.tabs.context"`, icon `FileText`).
  - `client/src/app/skills/[id]/_components/SkillEditor/SkillEditor.tsx` — add `{tab === "context" && <ContextTab key={skill.id} skill={skill} />}` after `:30`.
  - `NEW …/SkillEditor/_components/ContextTab/ContextTab.tsx` + `index.ts` (named only)
  - `client/messages/en/skills.json` — add `editor.tabs.context` (`:41-46`) and an `editor.context.title` = "Project context to use".
- Context: same as Step 13. `SkillEditor` tab switch is at `:27-30`.
- Change: the same wiring as Step 13, with `useSkillContext`/`useSetSkillContext` and `header="count"` (`{attached} attached`).
- Skills: `frontend-ui-architecture`, `react-best-practices`.
- Done when: client typecheck passes.
- Depends on: 12
- Agent: implementer — Phase: 4

### Step 15 — Trace drawer: Project context section  (package: client)
- Covers: AC14, NFR10, NFR11, NFR12 (client render of old traces)
- Files:
  - `NEW client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/ProjectContextSection/ProjectContextSection.tsx` + `index.ts` (named only)
  - `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` — render it inside the Prompt assembly `TraceSection` (`:74-101`), right after the `specs` `PromptBlock` (`:94-96`), only when `trace.project_context?.length`.
  - `…/RunTraceDrawer/styles.ts` — add a commented section of styles.
  - `client/messages/en/runs.json` — add a `trace.projectContext.*` block: `title` = "Project context — attached specs (untrusted)", `tokens` = `"~{count} tok"`, `status.included|missing|rejected|over_limit`, `skill` = `"via {name}"`, `expand`, `collapse`.
- Context:
  - The Specs read row already lists `specs_read` (`TraceBody.tsx:39-51`; AC14's last clause needs no change).
  - Expand-state pattern: `…/_components/ToolCallRow/ToolCallRow.tsx`.
  - `PROMPT_COLORS` is in `RunTraceDrawer/constants.ts` (imported at `TraceBody.tsx:9`).
- Change:
  - One entry per item, with path, status label (text, not colour only) and `~N tok` when tokens are not null.
  - The expand button is a real `<button aria-expanded>`. Expanding an `included` entry shows `text` in a `<pre>`. Non-included entries show the status label and no text.
  - Hooks: `data-project-context-entry={path}` and `data-project-context-status`.
- Skills: `frontend-ui-architecture` (stateful child gets a folder, parent-owned styles), `react-best-practices`.
- Done when: `.claude/scripts/check-changed.sh client` passes, then `--full`.
- Depends on: 1, 9
- Agent: implementer — Phase: 4

## 5. Test plan
- Existing suites to run:
  - Per step: `.claude/scripts/check-changed.sh <pkg>`.
  - End of each phase: `--full` — Phase 1 `server client`, Phase 2 `reviewer-core server`, Phase 3 `server` (then `server --full --it` with Docker), Phase 4 `client`.
  - `*.it.test.ts` that need `--it` (Docker): `server/test/reviews.it.test.ts` (regression on the trace + executor path) and the new `server/test/project-context.it.test.ts`.
- Tests to add or change (owner: test-writer):
  - `reviewer-core/test/prompt.test.ts` — covers AC9, AC12, NFR7, EC16, EC17. Lane: reviewer-core.
    - `{label:'specs/a.md', text}` produces `<untrusted source="specs/a.md">` under `## Project context`.
    - With string specs or no specs, `messages`/`assembly` are byte-identical to a snapshot taken before the change.
    - A label `a"><x>.md` keeps the opening tag intact (`source="a&quot;&gt;&lt;x&gt;.md"`).
    - `</untrusted>` in the text is escaped.
    - Doc text never appears in the system message.
  - `reviewer-core/test/run.test.ts` — covers AC9, EC10, NFR5. Lane: reviewer-core. Specs reach every map-reduce chunk call, and the fake LLM call count is the same with and without specs.
  - `NEW server/test/project-docs-path.test.ts` — covers AC1 (roots), AC5, NFR1 (syntax fixtures), EC17. Lane: hermetic.
    - `globToRegExp`: the default root matches `specs/a.md`, `docs/b.md`, `insights/c.md`, `x/docs/y/z.md` and not `src/d.md` or `specs/e.txt`.
    - `docTypeFor('docs/specs/x.md')` is `specs`.
    - `checkContextPathSyntax` rejects `../x.md`, `specs/../../etc/passwd.md`, `/etc/x.md`, `C:\x.md`, `specs/%2e%2e/x.md`, a NUL path and a newline path.
  - `NEW server/test/project-docs-fs.test.ts` — covers AC1, AC3 (read), AC5, NFR1, NFR2, NFR4, EC3, EC7, EC9, EC18. Lane: hermetic, real tmp dir.
    - The AC1 fixture returns exactly the three docs, sorted.
    - `node_modules/specs/x.md` is excluded.
    - Symlinks in `specs/` pointing outside the clone and to `src/secret.md` are not listed, and `read` returns `invalid`; an injected `readFile` spy records no path outside the clone and no read of the rejected targets.
    - 501 docs give 500 docs and `truncated: true`.
    - The 5,000-visit stop works.
    - A 65,537-byte doc is listed but `read` returns `too_large`.
    - Invalid UTF-8 gives `not_utf8`.
    - A missing clone gives `clone_unavailable`.
  - `NEW server/test/project-context-domain.test.ts` — covers AC9 (order), AC10, AC11, AC13, EC11, NFR2, NFR3. Lane: hermetic.
    - `orderCandidates` orders agent then skills and keeps the first duplicate.
    - `buildProjectContext` maps statuses and enforces the per-doc and 24,000 per-run caps, continuing after an over-limit doc.
    - The sum of `tokens` equals the sum of ceil(chars/4) of each `text`.
  - `NEW server/test/project-context-executor.test.ts` — covers AC9, AC10, AC11, AC12, AC13, EC12, EC19, EC20, NFR5, NFR9 (and AC15's `specs_read` half). Lane: hermetic.
    - Pattern: `server/test/prompt-log-executor.test.ts:15-66` with a fake `ProjectContextRunPort` or a real `ProjectContextService` over an in-memory repository fake + `FsProjectDocs` on a tmp dir.
    - `prompt_assembly.specs` holds one block per included doc, in order, each naming the path.
    - The fake LLM user message contains `## Project context`.
    - A missing doc gives run status `done`, a `project_context` entry `{status:'missing', tokens:null}`, the path absent from `specs_read`, and one `info` line.
    - With no attachments, the `system`/`user` snapshot is identical, `specs` is null and `specs_read` is `[]`.
    - `repoIntel:false` still adds context.
    - The LLM call count is unchanged.
    - No doc text appears in the pino event or the Live Log.
    - A failure before the prompt keeps `specs_read: []` and no `project_context`.
  - `server/test/contracts.test.ts` — covers AC13, NFR12. Lane: hermetic. A stored trace with no `project_context` key still parses (extend `:186-201`); a trace with all four statuses parses.
  - `NEW server/test/project-context.it.test.ts` — covers AC1, AC3, AC4, AC5, AC6, AC8, EC3, EC4, EC13, EC14, NFR4, NFR6. Lane: it (Docker).
    - Setup: `buildApp` with `DEVDIGEST_CLONE_DIR` set to a tmp dir holding the fixture clone.
    - `GET /repos/:id/context` returns 200, sorted, with all fields.
    - Unknown repo gives 404 `repo_not_found`; no clone gives 409.
    - `GET /repos/:id/context/file` returns 200 `content`; 404 when missing; 413 over 64 KB.
    - Every NFR1 fixture gives 400 `context_path_invalid` on the file route and on PUT.
    - PUT then GET keeps the order, another repo returns `[]`, `GET /agents/:id` keeps the same `version`, and the stored row has no content column.
    - Skill PUT/GET work and `GET /skills/:id/versions` is unchanged.
    - 51 paths or a duplicate gives 400 `validation_error`.
    - `used_by_agents` is 3 for the AC4 fixture and drops after agent delete (EC14).
    - `missing[]` lists a deleted file.
    - NFR6: a 5,000-file clone lists in under 1 s (p95 over 20 calls).
  - `client/src/components/app-shell/nav.test.tsx` — covers AC2. Lane: client. WORKSPACE keys are `["pulls","context"]` and the link resolves to `/repos/<id>/context`.
  - `NEW client/src/app/repos/[repoId]/context/_components/ContextView/ContextView.test.tsx` — covers AC2, AC3, AC4, EC1, EC3, EC9, NFR8, NFR11. Lane: client (mock `@/components/app-shell` per client INSIGHTS).
    - One row per doc; the footer reads "3 files · N tokens total"; the word "chunks" is absent.
    - Selecting a doc renders its headings, with no `textbox` and no edit button.
    - "Used by 3 agents" shows.
    - The empty state names the roots; 409 shows the error with retry; the truncated banner shows.
    - The XSS fixture renders no `script`, no `onerror` and no `javascript:` href.
  - `NEW client/src/components/context-doc-picker/ContextDocPicker.test.tsx` — covers AC7, EC2, EC4, EC15, NFR10, NG9. Lane: client.
    - Checking 120- and 197-token docs shows "≈ 317 tokens" and calls `onChange` once with both paths, in order.
    - The header reads "2 of N attached".
    - The filter narrows rows; no match shows a clear-filter button.
    - A missing row is checked and can be unchecked.
    - Each checkbox is named by its path; the Preview button has a name; the live region exists.
    - There is no drag handle.
  - `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` — covers AC6 (client), AC7. Lane: client. The Context tab exists and toggling issues one `PUT /agents/:id/context` with `repo_id` from the active repo.
  - `client/src/app/skills/[id]/_components/SkillEditor/SkillEditor.test.tsx` — covers AC8. Lane: client. The Context tab shows "{n} attached" and a toggle issues `PUT /skills/:id/context`.
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx` — covers AC14, NFR12. Lane: client.
    - The section title, one entry per item and `~N tok` show.
    - Expanding an included entry shows its text; a missing entry shows its label and no text.
    - "Specs read" lists the paths.
    - A trace without `project_context` renders with no section.
  - AC15 — manual: attach a doc with "module `api/` does not import `db/` directly" to an agent, run it on a PR where `api/x.ts` imports `db/`, and expect a grounded finding on the import line whose text names the doc path, with the path in `specs_read`. No automated lane exists (`e2e/AGENTS.md:8`, the e2e lane never calls an LLM).
- Needs Docker: yes (`project-context.it.test.ts`, `reviews.it.test.ts` regression). Everything else is hermetic or client.

## 6. Risks and open questions
- R1 — `client/src/vendor/ui/nav.ts` is a vendored file ("Do not touch"). AC2 cannot be met any other way, because `Sidebar` reads `NAV` directly (`client/src/vendor/ui/shell/Sidebar.tsx:3`), and the existing Conventions entry (`nav.ts:33`) shows the same edit was made before. Mitigation: a one-line, spec-sanctioned edit, flagged for the architecture-reviewer. Decides: user/reviewer, non-blocking.
- R2 — Escaping in `wrapUntrusted` labels also changes the output for skill names (`server/src/modules/reviews/helpers.ts:32`) and convention-scan paths (`reviewer-core/src/prompt.ts:300`) **only** when they contain `& " < >` or newlines. Such prompts change bytes, which is intended hardening. AC12 snapshots must use fixtures without those characters.
- R3 — `list` reads each listed doc to compute `tokens` = ceil(chars/4). That is up to 500 reads, plus up to 5,000 `readdir`/`stat` entries. NFR6 (1 s p95) is measured in the it test. If it fails, cache by `(path, mtime, size)` in the adapter. Do not change the token formula.
- R4 — `used_by_agents` counts disabled skills and agents (literal AC4). The run uses enabled skills only (EC12), so the count can exceed the agents that actually receive the doc. Routed to spec-creator in §0.
- R5 — Rejecting any `%` in a path is stricter than the spec's fixture list. It blocks a real file name containing `%` (rare). This is an inference made for simplicity and safety. It can be relaxed later to reject only `%2e`/`%2f`/`%5c`.
- R6 — Spec 400 vs app 422 for `validation_error` (§0). Mitigation: count and duplicate checks run in the service with an explicit 400. A missing `repo_id` stays 422.
- R7 — `ReviewRunExecutor` already takes `Container` (baselined violation). The new dependency comes in as a port parameter, which adds no new violation. Do not grow the baseline.
- R8 — OQ10 is out of scope. If the manual AC15 run does not cite the doc path, the follow-up is a trusted system-prompt line (as `buildScopePolicy` does, `reviewer-core/src/prompt.ts:80`). That needs a spec decision, not a plan change.
- Open questions: None blocking.

## 7. Not verified
- That `drizzle-kit generate` in this environment numbers the new migration `0015_…`. The latest file seen is `0014_soft_susan_delgado.sql` (Glob of `server/src/db/migrations/*.sql`); the journal itself was not read.
- That react-markdown 9 with the vendored `Markdown` component renders raw `<script>`/`<img onerror>` as inert (escaped or dropped) and strips `javascript:` hrefs. The component has no `rehype-raw` (`Markdown.tsx:10-37`), but the library default was not read. The NFR8 client test proves it. If it fails, add a `urlTransform`/`skipHtml` wrapper in the page's own component, not in vendor.
- That `client/src/vendor/shared/index.ts` re-exports `contracts/platform` and `contracts/trace` like the server copy (only the server index was read, `:17-27`).
- The exact contents of `AgentEditor.test.tsx` and `SkillEditor.test.tsx` (mocks in use). They were not read; test-writer follows them.
- Whether `IdParams` (`server/src/modules/_shared/schemas.ts`) is a uuid schema. It was used as in `blast/routes.ts:5`, but the file was not opened.

## 8. Execution mode
- Mode: multi-agent — chosen by: user.
- Phases:
  - Phase 1 — contracts + schema (server/client vendor shared, server db) — steps 1, 2 — check: `.claude/scripts/check-changed.sh server client --full`
  - Phase 2 — reviewer-core — step 3 — check: `.claude/scripts/check-changed.sh reviewer-core server --full`
  - Phase 3 — server — steps 4, 5, 6, 7, 8 — check: `.claude/scripts/check-changed.sh server` per step, `.claude/scripts/check-changed.sh server --full --it` at the end (Docker)
  - Phase 4 — client — steps 9, 10, 11, 12, 13, 14, 15 — check: `.claude/scripts/check-changed.sh client` per step, `--full` at the end
- Hand-off order (one writer per working tree; no `isolation: "worktree"` is needed because writers run sequentially):
  1. `implementer` — Phase 1 → Phase 2 → Phase 3 → Phase 4, one fresh run per phase. Input: this plan, §2, §3 and the step's Context line. Output: code + a phase check report.
  2. `plan-verifier` (scope: code) — input: plan + diff. Output: step/AC coverage of the code. Gate: every step's "Done when" holds.
  3. `architecture-reviewer` + `security-reviewer` — **in parallel** (both read-only). Architecture checks onion (new module, port, adapter, executor import), frontend placement and the R1 vendor edit. Security checks the AC5/NFR1 traversal and symlink handling, NFR7 label escaping, NFR8 XSS and NFR9 logs. Findings loop back to `implementer`.
  4. `test-writer` — all §5 tests (after the reviews settle). Check: `.claude/scripts/check-changed.sh reviewer-core server client --full`, plus `server --full --it` with Docker.
  5. `plan-verifier` (scope: final) — every AC in §1 maps to a passing test, or to the manual AC15 note.
  6. `doc-writer`:
     - `server/README.md` (env var `PROJECT_CONTEXT_ROOTS`, API map for the 5 routes)
     - `client/README.md` route map (`/repos/[repoId]/context`)
     - the `reviewer-core/README.md` specs slot (`SpecEntry`, label escaping)
     - INSIGHTS entries through `engineering-insights`, e.g. "`;` separates search roots because globs contain commas" and the R1 vendor-nav exception
- Gates: Phase N+1 starts only after Phase N's `--full` check passes. `/pr-self-review` is required before the PR.
