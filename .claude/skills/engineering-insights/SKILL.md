---
name: engineering-insights
description: >-
  Reads and maintains the per-package INSIGHTS.md knowledge files. Use at the
  start of work on any package — before editing, debugging, or answering a
  question about it — to recall what previous sessions learned about that
  module. Use again when a session surfaces something non-obvious (a trap, a
  dead end, a fixed recurring error, a dependency quirk, an architectural
  decision with its reason) and when wrapping up a task, to record it. Also use
  when the user runs /engineering-insights.
---

# Engineering insights

A knowledge loop over the `INSIGHTS.md` files. Three phases: **recall** before
work, **capture** during, **flush** at the end.

One invariant governs everything: **an existing insight is never removed.**
Entries may be added and enriched. Nothing already written is deleted, shortened,
reworded or reordered. See *Write safety*.

Paths below are relative to the repo root. The skill directory is
`.claude/skills/engineering-insights/`.

---

## Phase 0 — Recall (before work)

Run this before editing, debugging, or answering a question about a package.

1. Identify the package the request touches: `server`, `client`,
   `reviewer-core`, `e2e` — or root, if it spans several.
2. Read that package's `INSIGHTS.md` **and** the root `INSIGHTS.md`.
3. State in one line which entries bear on the task, or "no recorded insights
   apply". Name them; do not recite the file. Naming is what forces the content
   to be processed rather than skimmed, and it shows the read happened.
4. Treat named entries as high-confidence guidance unless the user says
   otherwise or the code visibly contradicts them.

An entry that turns out to be wrong is itself a finding — supersede it in
Phase 2. Do not silently work around it.

## Phase 1 — Capture (during)

Note a finding the moment it lands, not from memory at the end.

Append candidates to a session buffer in the scratchpad directory, **not** to the
repo. Capturing straight into `INSIGHTS.md` mid-task drops doc edits into
whatever diff the developer is about to commit.

A candidate is worth buffering when it passes the five gates below.

## Phase 2 — Flush (end of task, or on `/engineering-insights`)

### Step 1 — depth check

Estimate session depth from concrete signals: several tasks, user corrections,
errors and retries, abandoned approaches. A shallow session — a config tweak, a
rename, a change that went exactly as expected — **stops here and records
nothing**.

The default outcome of a flush is zero entries. Never manufacture an entry to
look productive. Padding is how these files turn into noise nobody reads.

### Step 2 — rank and cap

Order candidates by signal strength:

1. User corrections — the developer saying the agent was wrong
2. Approaches that failed or were abandoned
3. Patterns that repeated across the session
4. Error → fix sequences

**Keep at most five.** The cap is the quality mechanism: forced ranking drops
the marginal ones. The top two categories feed *What Doesn't Work*, which is the
most valuable and most-skipped section.

### Step 3 — dedup (blocking)

Before touching any file, for each surviving candidate:

```bash
bash .claude/skills/engineering-insights/scripts/find-related.sh <pkg> "<key terms>"
```

It searches the package file and the root file and prints matching headings with
line numbers.

| Situation | Action |
|---|---|
| No related entry | Add under the right section |
| Related entry, still correct | Enrich it — append detail, never a near-duplicate |
| Related entry, now wrong | Append a dated correction beneath it |
| Already stated in a `CLAUDE.md` or `README.md` | Drop the candidate |
| Overlap is ambiguous | Drop the candidate — the default is silence |

"Drop" always means *discard the new candidate*. It never means remove something
already in the file.

### Step 4 — one approval

Ask once, with a single `AskUserQuestion`, multi-select, listing the surviving
candidates. Each option carries **the exact proposed entry text**, not a title,
so it can be judged by reading the option rather than opening a file.

That multi-select is the approval. Do not re-confirm per entry.

### Step 5 — record, then confirm

Snapshot, append, verify (see *Write safety*), then report one line per
candidate: `added <heading>` · `enriched <heading>` · `skipped, already covered`.

---

## Write safety

An `INSIGHTS.md` holds knowledge that cannot be reconstructed. A bad edit costs
more than every entry this skill will ever add.

**The four permitted operations. Anything else is a bug:**

1. Append a new entry under an existing section.
2. Append lines to an existing entry — more detail, sharper evidence, a better
   `path:line`.
3. Append a dated correction beneath an existing entry.
4. Append a missing section heading from the seven-section schema.

**Forbidden:** deleting an entry, line or section; shortening or rewording
existing text; reordering entries; reflowing or reformatting the file. Enriching
means *adding to*. An entry only ever grows.

**Never use the `Write` tool on an `INSIGHTS.md`.** It replaces the file
wholesale and is the likeliest way to lose entries. Use `Edit`, with
append-shaped changes only.

**Every edit must produce zero deleted lines.** Enforce it:

```bash
# before editing
bash .claude/skills/engineering-insights/scripts/verify-append-only.sh snapshot <file>
# after editing
bash .claude/skills/engineering-insights/scripts/verify-append-only.sh check <file>
```

`check` restores the file from the snapshot if any line or heading disappeared,
and reports the violation. It restores from the snapshot rather than from git on
purpose: the developer may have their own uncommitted edits in that file, and a
git revert would destroy those too.

---

## The five quality gates

An entry must be actionable **cold** — read it in a fresh session and know what
to do, with no follow-up. All five must hold:

1. **Non-obvious** — a competent developer reading the code would not conclude
   it in a minute. *If it would be obvious to anyone reading the code, don't
   write it.*
2. **Verified this session** — observed, not inferred. No "might be", no "if not
   already handled".
3. **Actionable cold** — names the symptom, the threshold or number, the file or
   module, and what to do instead.
4. **Evidenced** — at least one `path:line`, command, or exact error string.
5. **Durable** — still true next month. "The build is red right now" is not an
   insight.

Gate 4 is the one that keeps these files honest. This project's own reviewer
drops findings whose line refs miss a real diff hunk; insights get the same
grounding discipline.

See `examples.md` for calibrated good/bad pairs and two worked dedup cases.

## Which file

| The insight is about | Goes to |
|---|---|
| One package's code, tests or build | `<pkg>/INSIGHTS.md` |
| Two or more packages | `INSIGHTS.md` (root) |
| The vendored `shared` copies drifting | `INSIGHTS.md` (root) — it is a contract |
| Docker, Postgres, `scripts/dev.sh`, CI | `INSIGHTS.md` (root) |

## Sections

Every `INSIGHTS.md` carries these seven, in this order. Place each entry under
the one that fits:

`What Works` · `What Doesn't Work` · `Codebase Patterns` ·
`Tool & Library Notes` · `Recurring Errors & Fixes` · `Session Notes` ·
`Open Questions`

*What Doesn't Work* is the most-skipped and the most valuable. Never drop it.
*Session Notes* entries are capped at two lines — it is the section most likely
to bloat into a chat replay.

## Entry format

```markdown
### Grounding gate silently drops findings with out-of-hunk line refs
`2026-09-25` — A finding whose `line` falls outside any diff hunk is removed
before scoring, so a run shows fewer findings than the model returned, with no
warning in the response or the logs. Check the gate before blaming the prompt.
Evidence: `reviewer-core/src/grounding.ts:41`
```

The H3 is a **claim**, not a topic — never just "Grounding". Phase 0 reads the
whole file every session, so headings must be scannable without reading bodies.

Hard-wrap at 80 columns, matching the rest of the repo's docs.

## Never record

- Secrets, tokens, `.env` values
- The user's name or email
- Absolute paths under `/Users/`
- Anything learned from `server/clones/**` — git-ignored runtime checkouts
- Speculation, or anything already stated in a `CLAUDE.md` or `README.md`
- Learnings about this skill itself — those belong in the skill, not in
  `INSIGHTS.md`

## Maintenance

- **Append-only.** Supersede with a dated correction; never rewrite.
- **Promote** — when an insight hardens into a rule binding every change, copy
  it into that package's `CLAUDE.md` under `## Conventions (not obvious from
  code)` as one line, and append a pointer to the original entry. Do not remove
  the entry; promotion without a pointer is a deletion in disguise.
- **Soft cap ~40 entries per file.** Phase 0 reads the whole file every session,
  so length is a running cost. Past the cap, report and list prune-or-split
  candidates — never prune. Deletion is the developer's call, in a normal commit.

## Gotchas

- **Auto-activation is unreliable.** This skill fires from its description,
  which works sometimes. If the loop matters for a session, invoke
  `/engineering-insights` explicitly. A Stop hook makes it dependable; see
  `references.md`.
- **The scratchpad buffer dies with the session.** An uncaptured finding is
  lost. Flush before reporting a task complete, not after.
- **Enriching an entry is still an append.** Add a line beneath it. Do not
  rewrite the original sentence to fold the new detail in — that deletes text
  and trips the append-only check.
- **Empty section headings are not entries.** A file with all seven headings and
  no `###` beneath them is still empty; do not report it as having content.
- **Root vs package is decided by the insight, not by the file you edited.** A
  change made only in `server/` can still be a root insight if the reason spans
  packages.