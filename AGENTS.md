# dev-digest (root) - agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each lesson adds one feature.

## Before answering
Search the relevant package's `<pkg>/docs/`, `<pkg>/specs/`, `<pkg>/INSIGHTS.md` first for what the user asks.
Read `<pkg>/INSIGHTS.md` before working in a package and name the entries that apply. Treat them as high-confidence guidance.

## Packages
Four standalone packages — **no workspace**, no root lockfile. Cross-package code is *copied* into `src/vendor`, never imported.

| pkg | name | role | stack | pm |
|---|---|---|---|---|
| `server` | `@devdigest/api` | imports repos + PRs, indexes a repo (`repo-intel`), stores agents, runs the reviewer | Fastify 5 · Drizzle + `postgres` · Zod · tsx · vitest + testcontainers · `@ast-grep/napi` (version pinned) | pnpm |
| `client` | `@devdigest/web` | the UI: repo import, PR list + detail, reviews, agent authoring | Next 15 App Router · React 19 · TanStack Query · next-intl · Recharts · vitest + jsdom + RTL | pnpm |
| `reviewer-core` | `@devdigest/reviewer-core` | pure engine: diff → prompt → LLM → grounded findings. No DB, GitHub or FS | `openai` + Zod only. Consumed as **raw TS source** via tsconfig alias — it never emits JS | npm |
| `e2e` | `@devdigest/e2e` | deterministic browser flows over the main journeys | agent-browser (global CLI) + `run.ts`. **No runtime deps** | npm |

`@devdigest/shared` is a fifth, pseudo-package: the Zod contracts at `server/src/vendor/shared`.

Ports: web **3000** · API **3001** · Postgres **5432**. Only Postgres runs in Docker; API and web run on the host.
Env: `server/.env` + `client/.env`, both copied from `.env.example`. No API key is needed to boot. Secrets never live in `AppConfig` — they pass through `SecretsProvider` (`~/.devdigest/secrets.json`).

## Commands
```bash
./scripts/dev.sh              # whole stack from zero (--no-seed · --no-client · --db-only)
./scripts/e2e.sh              # hermetic e2e on alt ports 5433/3101/3100 — never touches the dev DB
./scripts/install-hooks.sh    # once per clone: git pre-push → PR self-review gate
```

| | server | client | reviewer-core | e2e |
|---|---|---|---|---|
| install | `pnpm install` | `pnpm install` | `npm ci` | `npm ci` |
| dev | `pnpm dev` (:3001) | `pnpm dev` (:3000) | — | — |
| typecheck | `pnpm typecheck` | `pnpm typecheck` | `npm run typecheck` | `npm run typecheck` |
| test | `pnpm test` | `pnpm test` | `npm test` | `npm test` |
| build | `pnpm build` | `pnpm build` | `npm run build` (type-check only) | — |

Server DB: `pnpm db:generate` · `db:migrate` · `db:seed`. The server does **not** migrate on boot — `relation ... does not exist` means migrations were never applied.

Three things that cost the most time here:

- **`pnpm` is broken in this environment.** Node is v20.17.0 (README asks ≥ 22) and corepack dies with `Cannot find matching keyid`. Run every `pnpm <script>` above as `./node_modules/.bin/<bin>` instead — `vitest run`, `tsc --noEmit`, `next build`, `tsx src/db/migrate.ts`, `drizzle-kit generate`. This also takes out `scripts/dev.sh` and `scripts/e2e.sh`: both gate on `command -v pnpm`. `npm` is unaffected, so `reviewer-core` and `e2e` run as documented.
- **Type-checking `server` needs `reviewer-core`'s deps installed** (`cd reviewer-core && npm ci`). The server aliases `@devdigest/reviewer-core` to that package's raw source, which imports `openai`/`zod`; without them `tsc` fails with TS2307 and the API won't boot (`ERR_MODULE_NOT_FOUND`).
- **There are no `test:unit` / `test:integration` scripts.** The two server suites are selected inline by glob: `vitest run --exclude '**/*.it.test.ts'` (hermetic) vs `vitest run .it.test` (needs Docker).

## Conventions (not obvious from code)
- `server/src/vendor/shared` and `client/src/vendor/shared` are separate copies and have already drifted — a contract change means editing both or neither.
- pnpm in `server`/`client`, npm in `reviewer-core`/`e2e`. Separate lockfiles; do not unify.
- In the client, `@devdigest/shared` is **type-only** — importing a runtime value from it breaks the webpack build.

## Naming conventions
- **Server modules** — `routes.ts` is mandatory and exports `default async function <module>Routes`. `service.ts` / `repository.ts` / `helpers.ts` / `constants.ts` are added *when the module needs them*, not always present (`polling/` and `workspace/` are `routes.ts`-only; only `agents/` and `repos/` have all five). Extra files are kebab-case topic nouns; a `repository.ts` may grow into `repository/<aggregate>.repo.ts`.
- **Server tests** — flat `server/test/`, kebab-case topic name. A test that touches the DB (imports `test/helpers/pg.ts`) **must** be `*.it.test.ts`, or it lands in the hermetic lane and breaks CI. Helpers live in `test/helpers/` with no `.test.` in the name.
- **Drizzle** — table const camelCase → `pgTable('snake_case_plural')`; field camelCase → `('snake_case')` column; unique indexes suffixed `_uq`.
- **Client components** — a folder: `Name.tsx` · `styles.ts` (always `export const s`) · `index.ts` (re-exports named **and** default) · `Name.test.tsx` / `constants.ts` / `helpers.ts` as needed. Two folder-case zones: PascalCase under `app/**/_components/`, kebab-case under `src/components/` with a PascalCase file inside.
- **Client routes** — lowercase segments, `page.tsx`, `_components/` for route-local children, `[param]` named for its entity when a route nests several (`[repoId]/pulls/[number]`).
- **Test hooks** — semantic `data-<thing>` attributes, never `data-testid` (there are none): `data-finding-id`, `data-severity-pill`, `data-findings-trigger`.
- **i18n** — one file per namespace, `client/messages/en/<ns>.json`, camelCase keys nested by UI surface. A new file is picked up automatically. User-facing strings never go inline in JSX.
- **Contracts** — PascalCase const + identically-named `z.infer` type. Wire fields are snake_case. `.nullish()` for optional-or-null, `.nullable()` for always-present-but-null, `.optional()` only on request inputs.
- **e2e specs** — `NN-kebab-topic.flow.json`. The suffix is load-bearing (`run.ts` filters on it) and the `NN` prefix sets run order.
- **Git** — Conventional Commits, `type(scope): lowercase subject`. Lesson branches override it with an `L<NN>-lab[-hw]:` prefix.

## Do not touch
- `server/clones/**` — runtime git checkouts, git-ignored, never test input.
- `docker compose down -v` — drops the `devdigest_pgdata` volume and every imported repo and review.
- `server/src/db/migrations/**` — drizzle-kit writes the `.sql`, its `meta/NNNN_snapshot.json` and the `meta/_journal.json` entry together. Never hand-write, rename or renumber one, and never edit a migration that has already been applied — add a new one. (`0000_init.sql` and `0001_add_agent_run_error` predate the generator.)
- **Lockfiles** — never unify them. In `server`/`client` the **pnpm** lockfile is authoritative: it is what CI's `pnpm install --frozen-lockfile` reads. The `package-lock.json` sitting beside it in both is a leftover committed in `0af1a19`; CI ignores it, so do not run `npm install` there and do not treat it as the source of truth.
- `*/src/vendor/**` — vendored copies, not sources.

## Use when
- Quick start, env vars, troubleshooting in depth → read `README.md`
- Choosing or running a test suite, the suite map → read `TESTING.md`
- Writing an agent system prompt or picking a template → read `docs/agent-prompts/README.md`
- Cross-cutting findings → read `INSIGHTS.md`
- Before opening, pushing or merging a PR → run `/pr-self-review` (`.claude/skills/pr-self-review/`); any CRITICAL blocks it
- Working inside a package → read `server/AGENTS.md`, `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `e2e/AGENTS.md`
