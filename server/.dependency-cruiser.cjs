/**
 * Onion Architecture boundaries for server/src. Dependencies point inward:
 *   routes (presentation) → service (application) → ports/domain (core)
 *                         ↖ repository / adapters (infrastructure)
 *   platform/container.ts is the composition root and may import anything.
 *
 * Rules and their rationale: .claude/skills/onion-architecture/SKILL.md
 * Pre-existing violations are frozen in .dependency-cruiser-known-violations.json
 * and ignored via `--ignore-known`; only NEW violations fail.
 *
 * Run: ./node_modules/.bin/depcruise src --config .dependency-cruiser.cjs --ignore-known
 */

/** Core = the innermost rings: per-module domain/ports and shared src/ports. */
const CORE = '^src/(modules/[^/]+/(domain|ports)\\.ts$|ports/)';
/** Infrastructure libraries the core and application layers must not see. */
const INFRA_LIBS =
  '(^|/)node_modules/(fastify|fastify-[^/]+|@fastify/[^/]+|drizzle-orm|postgres|octokit|@octokit/[^/]+|openai|@anthropic-ai/[^/]+|simple-git|@vscode/ripgrep|@ast-grep/[^/]+|js-tiktoken|dependency-cruiser)/';
/** Application = every module file that is not presentation, infrastructure or a registry. */
const APPLICATION = '^src/modules/[^/]+/';
const NOT_APPLICATION =
  '(^src/modules/_shared/|/routes\\.ts$|/repository\\.ts$|/repository/|\\.repo\\.ts$|/index\\.ts$|/(domain|ports)\\.ts$)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-no-infrastructure',
      severity: 'error',
      comment:
        'domain.ts / ports.ts / src/ports are the core: no frameworks, no Drizzle, no SDKs, no adapters, no DB.',
      from: { path: CORE },
      to: {
        path: [INFRA_LIBS, '^src/(adapters|db|platform/container\\.ts$)', '^src/modules/[^/]+/(routes|service|repository)\\.ts$', '/repository/'],
      },
    },
    {
      name: 'core-zod-type-only',
      severity: 'error',
      comment: 'The core may use `import type` from zod (z.infer), never a runtime zod call.',
      from: { path: CORE },
      to: { path: '(^|/)node_modules/zod/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'application-no-infrastructure',
      severity: 'error',
      comment:
        'Services/use cases depend on ports, not on Drizzle, the DB, concrete adapters or the Container (service locator).',
      from: { path: APPLICATION, pathNot: NOT_APPLICATION },
      to: {
        path: [INFRA_LIBS, '^src/(adapters|db)/', '^src/platform/container\\.ts$', '^src/modules/[^/]+/(repository\\.ts$|repository/)'],
      },
    },
    {
      name: 'routes-no-data-access',
      severity: 'error',
      comment:
        'routes.ts parses, calls a service, maps to a DTO. No drizzle-orm, no db/schema, no repositories, no adapters.',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: {
        path: ['(^|/)node_modules/(drizzle-orm|postgres)/', '^src/(db|adapters)/', '^src/modules/[^/]+/(repository\\.ts$|repository/)'],
      },
    },
    {
      name: 'adapters-not-inward-of-modules',
      severity: 'error',
      comment: 'Adapters implement ports; they never reach into feature modules.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        'A module may use another module only through its domain.ts / ports.ts / types.ts, or via the Container.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/', '^src/modules/[^/]+/(domain|ports|types)\\.ts$'],
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Cycles make the ring order meaningless.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^src/(vendor|db/migrations)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.json'],
    },
  },
};
