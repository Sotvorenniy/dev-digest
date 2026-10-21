# skill-evals — shared convention

> **Superseded layout.** Executable evals now live in the `evals/` package (see "Runner" below). The
> folder-per-skill convention described next is kept for the existing `onion-architecture` and
> `architecture-reviewer` evals; new evals go to `evals/skills|agents|workflow/`.

Evals belong to the skill they test. Every first-party skill that has evals carries them in
its own folder, so they travel with it (plugin packaging, copying the skill to another repo):

```
.claude/skills/<skill>/evals/
├── eval.md                  task prompts, run conditions, output contract, grading thresholds
├── expected-findings.json   answer key: one entry per planted problem (file, locations, rule, severity)
└── fixtures/<case>/...      code under test; paths mirror the repo (server/src/..., client/src/...)
```

This folder holds only what is shared by all skills: the convention and, later, the runner.
It contains no data of any particular skill. To add evals to a skill, create its `evals/`
folder — no central registration.

## Writing a case

- **No hints in fixtures.** No comment, identifier or string may say what is wrong. Check:
  `grep -rniE "todo|fixme|violat|bad|wrong|hack|should" .claude/skills/<skill>/evals/fixtures`
- **Real shapes.** Use the repo's real tables, contracts and adapters, so a reviewer can
  check the fixture against the code.
- **Clean controls.** List files with no planted problem in `clean_files`; a finding there is
  a false positive.
- **Locations, not one line.** A problem often spans an import and a use; list every line a
  reviewer could fairly cite.

## Answer-key isolation

The agent under test must never see `expected-findings.json` or `eval.md`'s grading section.
The runner stages each run in a temp folder **outside the repo**:

- `<tmp>/skill/` — the skill copied without `evals/` (given to the with-skill run);
- `<tmp>/fixtures/` — `evals/fixtures/` copied as is;
- prompts with `{{FIXTURES}}` replaced by `<tmp>/fixtures`.

Inside the repo the answer key is still reachable by search, so CI runs the agent with
`.claude/skills/*/evals/` excluded from its readable paths.

## Runner

The executable runner is the `evals/` package (`pnpm eval:skills`, `eval:agents`, `eval:workflow`,
`eval:benchmark`; see `evals/README.md`). Cases there live in `evals/skills/<name>/<name>.cases.ts`
with fixtures beside them, **outside** the skill folder. Two helpers sit on top for end-to-end runs on the
real repo: `/skill-eval <skill>` (with-skill vs baseline, key in `evals/skills/<skill>/audit/`) and
`/instructions-eval <name>` (nested vs root-only instruction files, key in `evals/instructions/<name>/`).

The folder-per-skill layout above (`.claude/skills/<skill>/evals/`) is the earlier convention; new evals go
to `evals/`. The existing `onion-architecture` and `architecture-reviewer` evals still use the old layout and
are not migrated yet. Known gap: runs are isolated by instruction, not by a staged copy outside the repo.
