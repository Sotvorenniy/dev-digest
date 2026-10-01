# Examples

Calibration for the five quality gates. The test that decides most cases:
*if it would be obvious to anyone reading the code, don't write it.*

## Contents

- Vague vs useful
- Calibrated to this repo
- Worked dedup cases

---

## Vague vs useful

| ✗ Noise | ✓ Insight |
|---|---|
| "Promises can be tricky" | "`Promise.all()` on the ingest pipeline times out past 30 items — for that module use `Promise.allSettled()` with batches of 10" |
| "be careful with async" | "checkout-flow state always goes through Zustand (`cartStore.ts`), because three components share the cart; local state does not work here" |

The left column makes a future session re-investigate. The right column tells it
what to do. That difference is the whole bar.

---

## Calibrated to this repo

### ✓ Good — names the mechanism and the tell

```markdown
### Integration tests in the unit suite fail on a missing DATABASE_URL, not on the query
`2026-09-25` — A DB-backed test not named `*.it.test.ts` is collected by the
hermetic unit suite, where no Postgres is up. The failure surfaces as a
connection error inside the first query, so it reads like a broken repository
method rather than a misfiled test. Check the filename before debugging the SQL.
Evidence: `server/vitest.config.ts:14`
```

Passes all five gates: the naming rule is in `server/AGENTS.md`, but the
*misleading failure mode* is not — and that is the part that costs an hour.

### ✓ Good — a contract trap across packages, so it files at root

```markdown
### A shared-contract change that type-checks in server can still break client at runtime
`2026-09-25` — `server/src/vendor/shared` and `client/src/vendor/shared` are
separate copies. Editing one leaves the other stale, and because the client
imports the contracts type-only, nothing fails at build time — the mismatch
surfaces as a runtime shape error in the browser. Change both copies or neither.
Evidence: `client/src/lib/feature-models.ts:1`
```

### ✗ Bad — true, but obvious from the code

```markdown
### The server uses Fastify
```

Fails gate 1. Anyone opening `server/src/app.ts` learns this in seconds.

### ✗ Bad — no evidence, and speculative

```markdown
### Grounding might drop some findings sometimes
`2026-09-25` — There could be cases where findings get filtered unexpectedly.
```

Fails gates 2, 3 and 4. "Might", "could be", no file, no line, nothing to act on.

### ✗ Bad — not durable

```markdown
### CI is failing on main right now
```

Fails gate 5. True today, misleading next week. If the *cause* was non-obvious,
record the cause; the outage itself is not an insight.

---

## Worked dedup cases

### Case 1 — already covered, so drop the candidate

Candidate: *"DB-backed tests must be named `*.it.test.ts`."*

`find-related.sh` finds no entry, but `server/AGENTS.md` already states it under
`## Conventions (not obvious from code)`.

**Action: drop the candidate.** Recording it duplicates the convention and the
two copies will eventually disagree. Note the contrast with the good example
above — the *failure mode* was new information, the naming rule itself is not.

### Case 2 — related entry exists and is still right, so enrich it

Existing:

```markdown
### Integration tests in the unit suite fail on a missing DATABASE_URL, not on the query
`2026-09-25` — A DB-backed test not named `*.it.test.ts` is collected by the
hermetic unit suite, where no Postgres is up. [...]
Evidence: `server/vitest.config.ts:14`
```

Candidate: *"The same thing happens to a test that imports a repository
transitively, even when it never touches the DB itself."*

**Action: append one line beneath the existing entry.** Do not add a second
entry, and do not rewrite the original sentence to fold the detail in — that
deletes text and trips the append-only check.

```markdown
`2026-09-26` — Also fires transitively: importing a module that pulls in a
repository is enough, even when the test itself issues no query.
```

### Case 3 — the entry is now wrong, so correct it beneath

Never edit the original claim. Append:

```markdown
`2026-10-02` — Correction: this stopped applying when the unit suite gained a
`setupFiles` stub for the pool. The misleading error is now an explicit skip.
```

The superseded text stays. The history of a wrong belief is often the useful
part — it tells a future session why the code looks the way it does.