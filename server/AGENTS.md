# server (@devdigest/api)

## Before answering
Search `server/docs/`, `server/specs/`, `server/INSIGHTS.md` first.
Read `server/INSIGHTS.md` before working here and name the entries that apply. Treat them as high-confidence guidance.

## Conventions (not obvious from code)
- A feature module is `server/src/modules/<name>/`. `routes.ts` (Fastify plugin) is mandatory; `service.ts` · `repository.ts` · `helpers.ts` · `constants.ts` are the roles to reach for as the module needs them — `polling/` and `workspace/` are `routes.ts`-only, and only `agents/` and `repos/` have all five.
- Layering follows Onion Architecture: imports point inward (`routes` → `service` → `ports`/`domain` ← `repository`/adapters), `platform/container.ts` is the only place concrete classes are built. Enforced by `.dependency-cruiser.cjs` against a baseline of existing violations — see the `onion-architecture` skill.
- Adding a module = one import + one entry in `server/src/modules/index.ts`. Registration is static on purpose — dynamic `import()` of `.ts` is not portable across tsx, vitest and the bundler.
- A DB-backed test **must** be named `*.it.test.ts`, or it lands in the hermetic unit suite and breaks CI.
- Secrets are never part of `AppConfig` — they only pass through `SecretsProvider`.

## Do not touch
- `server/src/vendor/shared` — a vendored copy; editing it does not change the client's copy.
- `server/clones/**` — runtime checkouts, git-ignored.

## Use when
- API map, env vars, DI flow, review context → read `server/README.md`
- Unit vs integration split → read `TESTING.md`
- Deep-dives and design notes → read `server/docs/`
- Findings and gotchas → read `server/INSIGHTS.md`
