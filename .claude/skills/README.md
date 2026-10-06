# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Onion layering for `server/`: dependency rule, ports, depcruise gate (first-party, v1.0.0) |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [frontend-ui-architecture](frontend-ui-architecture/SKILL.md) | Frontend | UI architecture & code placement: folders, boundaries, business logic (first-party, v1.1.0) |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [engineering-insights](engineering-insights/SKILL.md) | Project | Recall and record findings in `<pkg>/INSIGHTS.md` (first-party) |
| [pr-self-review](pr-self-review/SKILL.md) | Project | Pre-PR review of local changes: routes each file to its skills, blocks on CRITICAL (first-party, v1.0.0) |

Six of the skills above are vendored from GitHub and tracked in
`skills-lock.json`: `drizzle-orm-patterns`, `fastify-best-practices`,
`next-best-practices`, `postgresql-table-design`, `typescript-expert` and `zod`.
(The lock also pins `architecture-patterns` and `github-workflow-automation`,
which are not currently checked out here.)

The rest are **first-party — do not add them to the lock file**, or the next sync
will treat them as drift and clobber them: `engineering-insights`, `pr-self-review`,
`frontend-ui-architecture`, `onion-architecture`, `react-best-practices`, `react-testing-library`,
`security` and `mermaid-diagram`.

## Agent routing

Single source of truth for the agents that read skills (`.claude/agents/`: `planner`, `implementer`,
`test-writer`, `architecture-reviewer`, `doc-writer`). The planner assigns skills per step from this
table; the other agents read them before working. Read the `SKILL.md` of every row that matches the
files you touch.

| Files / task | Skills |
|---|---|
| `server/src/modules/**` — routes, services, repositories, ports, `platform/container.ts` | `onion-architecture`, `fastify-best-practices` |
| `server/src/db/**` — schema, queries, transactions | `drizzle-orm-patterns`, `postgresql-table-design` |
| `server/src/db/migrations/**` | never edit; generate with `drizzle-kit` (see `drizzle-orm-patterns`) |
| Contracts, request/response validation (`*/src/vendor/shared`, route schemas) | `zod` |
| New file / folder / hook / constant placement in `client/**` | `frontend-ui-architecture` |
| `client/**` components, hooks, state, data fetching | `react-best-practices`, `next-best-practices` |
| `client/**` tests (`*.test.tsx`) | `react-testing-library` |
| `server/test/**` — hermetic and `*.it.test.ts` | `onion-architecture` (`references/testing.md`) |
| Architecture review of a change set (read-only) | `onion-architecture`, `frontend-ui-architecture`, `pr-self-review/severity.md` (rubric only) |
| `docs/**`, `<pkg>/docs/**` — docs with diagrams | `mermaid-diagram` (doc-writer only; not for the implementer) |
| Input handling, auth, secrets, uploads, new endpoints | `security` (planned in, not reviewed by the implementer) |
| Hard typing problems in any package | `typescript-expert` |
| Recording a non-obvious finding | `engineering-insights` |

Reading order for both agents: root `AGENTS.md` → `<pkg>/AGENTS.md` → `<pkg>/INSIGHTS.md` → routed
`SKILL.md` files. Plans live in `.claude/plans/<task-slug>.md` (git-ignored, deleted after the work is
verified and reviewed; durable findings go to `INSIGHTS.md`).

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
- `scripts/` — Executable helpers (optional). Prefer a script over model judgment
  for anything mechanical and safety-critical; it is deterministic and costs no
  context. See `engineering-insights/scripts/`.
