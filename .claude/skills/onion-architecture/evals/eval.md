---
skill: onion-architecture
answer_key: expected-findings.json
fixtures: fixtures/
cases: [finding-digest, repo-health, finding-export, pr-triage]
thresholds:
  recall: 0.9
  max_false_positives: 0
---

# onion-architecture — review eval

Three small fake server modules with three planted violations each, and one larger case,
`pr-triage` (a new module plus a facade file added to `intent`), with five: two that
dependency-cruiser reports and three facade-laundering imports it cannot see (rule 1.1.0).
`pr-triage/domain.ts` imports `intent/domain.ts` legitimately — a false-positive trap. The fixtures carry
no comments or names that hint at the problems. Paths under `fixtures/<case>/` mirror the
repo: `fixtures/<case>/server/src/...` lands at `server/src/...`.

The answer key is `expected-findings.json`. The agent under test must never read it, so the
runner copies only `fixtures/` and the skill without `evals/` into a folder outside the repo.

## Task prompts

`{{FIXTURES}}` is the absolute path of the copied `fixtures/` folder.

### finding-digest

> I wrote a new backend module `finding-digest` for dev-digest. The files are in
> `{{FIXTURES}}/finding-digest/server/src/modules/finding-digest/` and will land at
> `server/src/modules/finding-digest/` in this repo (the container getter
> `findingDigestService` is wired the usual way). Can you review it before I open the PR?
> I mostly care whether it fits how the server is structured.

### repo-health

> here's my repo-health module for the server:
> `{{FIXTURES}}/repo-health/server/src/modules/repo-health/` (goes to
> server/src/modules/repo-health). before I wire it into platform/container.ts can you check
> the code is put together right? write up what you find

### finding-export

> Please review my finding-export feature for dev-digest's server. It's a module plus a port
> and a CSV adapter, all under `{{FIXTURES}}/finding-export/server/src/` (same relative paths
> as in the repo's server/src). Is everything in the right place and are the imports ok?

### pr-triage

> I'm adding a PR triage queue to the server. It's a new `pr-triage` module plus a small
> `types.ts` in the `intent` module so other modules have one place to import intent stuff
> from. Everything is under `{{FIXTURES}}/pr-triage/server/src/modules/` (same paths as the
> repo's server/src/modules). Can you review the architecture before I open the PR?

## Run conditions

- The repo is read-only for the agent. It may copy `server/` outside the repo and run
  `depcruise` or `tsc` there.
- Both runs (with skill and without skill) get the same prompt and the same tool freedom.
- The without-skill run must not call the Skill tool or read `.claude/`.

## Output contract

After the prose review, the agent appends one fenced `json` block — an array the runner parses:

```json
[
  {
    "file": "server/src/modules/finding-digest/routes.ts",
    "line": 25,
    "severity": "CRITICAL",
    "rule": "routes-no-data-access",
    "summary": "Route queries container.db directly."
  }
]
```

`file` is repo-relative, as the fixture would land. Only architecture findings go in the array;
correctness or style notes stay in the prose.

## Grading

- **Match.** A reported finding matches an expected one when `file` is equal and `line` is
  within ±3 of any entry in `locations` (or in an `also_at` entry). One report matches at
  most one expected finding. When a report fits several expected findings, prefer the one
  with the same `rule`, then the nearest line.
- **Recall** = matched expected findings / all expected findings, over all cases.
  Pass at **≥ 0.9**. With 14 expected findings this allows one miss (13/14 = 0.93).
- **False positive** = a reported finding whose `file` is in `clean_files`. Pass at **0**.
- Reports on other files that match nothing are listed for review, not failed: the fixtures
  can contain real defects that were not planted.
- **Severity** is recorded but not graded.
