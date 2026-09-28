# This repo — state on 2026-09-28

53 violations were frozen in `server/.dependency-cruiser-known-violations.json` when the
skill was introduced. They are tolerated, not endorsed: never copy one of these patterns
into new code, and shrink the baseline whenever you touch one of these files.

## Already onion-shaped (copy these)

- **Adapter ports** — `src/vendor/shared/adapters.ts` (`LLMProvider`, `GitHubClient`,
  `GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`, `SecretsProvider`), implemented in
  `src/adapters/*`.
- **Composition root** — `src/platform/container.ts`: lazy getters typed as ports,
  `ContainerOverrides` as the test seam.
- **Facade port** — `src/modules/repo-intel/types.ts` (`RepoIntel`), consumed by other
  modules via `container.repoIntel`.
- **Error taxonomy** — `src/platform/errors.ts`, mapped to HTTP only in `src/app.ts`.

## Baselined violations, by kind

| Kind | Count | Where | Fix |
|---|---|---|---|
| V1 — queries in routes (`routes-no-data-access`) | 8 | `pulls/routes.ts` (≈20 queries), `settings/routes.ts`, `polling/routes.ts`, `workspace/routes.ts` | Extract to a repository + port; route calls a service |
| V2 — service locator (`application-no-infrastructure` → `platform/container.ts`) | 9 | `agents`, `repos`, `reviews` (service, run-executor, diff-loader), `repo-intel` (service, pipeline/full, pipeline/incremental), `settings/feature-models.ts` | Constructor deps object of ports |
| V3 — service builds / imports a concrete repository | 13 | e.g. `agents/service.ts:54` `new AgentsRepository(container.db)` although `container.agentsRepo` exists | Depend on the port; construct in the Container |
| V4 — application imports `db/schema` / `db/rows` / drizzle / adapters | 15 | `reviews/run-executor.ts`, `reviews/diff-loader.ts` (→ `adapters/git/diff-parser`), `repo-intel/service.ts` + pipeline (→ `adapters/astgrep`, `adapters/codeindex/extract`, `adapters/tokenizer`), `repos/helpers.ts`, `settings/feature-models.ts` | Port for the capability; row types behind the repository |
| V5 — adapters import a module (`adapters-not-inward-of-modules`) | 2 | `adapters/astgrep`, `adapters/depgraph` → `modules/repo-intel/constants.ts` | Move the constants into the port or inject them |
| V6 — cross-module internals | 1 | `repos/service.ts` → `repo-intel/constants.ts` | Expose via `repo-intel/types.ts` |
| V7 — cycles | 5 | `repo-intel/service ↔ platform/container` (type-only `Container` import), `agents/helpers ↔ agents/repository` | Disappear with V2; move `isConfigChange` into `domain.ts` |

Plus 9 files using `container.db` directly — listed in `scripts/check.sh`
(`KNOWN_CONTAINER_DB`).

## Suggested refactor order (smallest blast radius first)

1. `workspace/routes.ts` — one query; becomes a thin module again.
2. `agents` — already has a repository; add `ports.ts`, `implements`, inject via
   Container, move `isConfigChange` to `domain.ts` (kills a cycle).
3. `polling`, `settings` — small; `settings/feature-models.ts` becomes a service.
4. `pulls/routes.ts` — the largest V1 (≈400 lines); needs a `pulls/repository.ts`,
   `service.ts` and ports; `reviews/repository/pull.repo.ts` may already cover part of it.
5. `reviews` — run-executor / diff-loader: port for diff parsing.
6. `repo-intel` — largest; pipeline gets ports for ast-grep / extract / tokenizer.

After each step, regenerate the baseline and confirm it only shrank.
