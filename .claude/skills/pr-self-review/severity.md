# Severity rubric

A skill that tags its own rules (`frontend-ui-architecture`, `react-best-practices`,
`onion-architecture` Checklist, `security` Severity Classification) keeps its own
tags — use the tag of the rule the finding breaks. This rubric is for the vendored
skills that have no scale (`zod`, `drizzle-orm-patterns`, `fastify-best-practices`,
`next-best-practices`, `typescript-expert`, `postgresql-table-design`) and for
anything a skill tags ambiguously.

**CRITICAL blocks the PR.** Use it only when you can name a concrete failure.

| Severity | Meaning | Examples |
|---|---|---|
| **CRITICAL** | Wrong behaviour, data loss, a vulnerability, a broken build, or an architecture violation that compounds. You can write the failing input → wrong output. | unvalidated request body reaches a query; `schema.parse` result ignored and raw input used; missing `await` on a transaction step; `sql.raw` with user input; Drizzle column dropped with no migration; Server Component importing a client-only module; `key={index}` on a reorderable list; route running a DB query (onion) |
| **HIGH** | Works today, fails at scale or under change; clear maintenance trap. | N+1 queries in a loop; missing index on a new FK used in a WHERE; `any` leaking through a public type; error swallowed with a generic message; `.passthrough()` on an external contract |
| **MEDIUM** | Hurts consistency and readability. | naming off-convention; duplicated helper; missing `.describe()` on a contract field |
| **LOW** | Nit or preference. | ordering, wording |

Rules that apply to every skill:

- Judge **added or changed lines only**. Pre-existing code is out of scope unless the
  change makes it newly reachable or newly wrong.
- No failure scenario → not CRITICAL. Unsure → one level lower.
- Project conventions in `AGENTS.md` / `<pkg>/AGENTS.md` / `<pkg>/INSIGHTS.md` override a
  generic skill rule when they conflict (e.g. `container.db` in baselined files, pnpm
  being broken, `@devdigest/shared` type-only in the client).
