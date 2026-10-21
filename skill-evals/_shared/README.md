# skill-evals — shared convention

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

## Runner (TODO — not written yet)

Planned `skill-evals/_shared/run-evals.ts`:

1. Glob `.claude/skills/*/evals/eval.md`; read the frontmatter (cases, thresholds).
2. For each case, stage it as above and spawn two agents with the same prompt:
   with skill and without skill (Skill tool off, `.claude/` unreadable).
3. Parse the trailing `json` block from each review (see the output contract in `eval.md`).
4. Score against `expected-findings.json`: recall, false positives on `clean_files`,
   unmatched reports listed for human review. Record tokens and duration.
5. Fail when the with-skill run is below its `eval.md` thresholds; report the
   with/without delta.

CI: a separate workflow (`.github/workflows/skill-evals.yml`), triggered by hand, on a
schedule, or on changes to `.claude/skills/**`. Not on every PR — each case calls the model
and needs an API key in CI secrets. Run results go to the job's artifacts, never to git.
