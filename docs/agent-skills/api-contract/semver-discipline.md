# semver-discipline

Flag a diff whose contract change is not matched by the right version bump and a changelog or migration note.

## What counts
- A breaking change (see breaking-change) with no MAJOR bump. For `0.x` packages, the MINOR bump is the equivalent.
- An additive change (new route, new optional field) with no MINOR bump when the project versions its API.
- A bug fix shipped as MINOR or MAJOR without reason, or a breaking change disguised as PATCH.
- A `/v1` path prefix changed in place (routes edited under `/v1` instead of adding `/v2`).
- A breaking change with no changelog entry or migration note (`CHANGELOG.md`, `docs/migration`, release notes).
- OpenAPI `info.version` not updated alongside the spec change.

## What does NOT count
- Internal refactors, tests, docs and CI changes that leave the contract identical.
- Private packages or services with no external consumers, when the repo states it does not version them.
- Version bumps done by a release tool at merge time, if the repo says so (check the PR description and CI config).

## How to check
1. Classify the diff: breaking, additive, or fix, using the route/schema/type changes.
2. Look for `package.json` `"version"`, OpenAPI `info.version`, and `/v1` style path prefixes in the diff.
3. Compare expected bump with the actual one: breaking needs MAJOR (`0.x`: MINOR), additive MINOR, fix PATCH.
4. Look for a changelog or migration-note hunk. Absence in the diff is the signal.
5. If versions live outside the diff, say so and downgrade rather than assume.

## Examples
**Bad**
```diff
 // package.json
-  "version": "1.4.2",
+  "version": "1.4.3",
 // routes.ts
-  app.delete('/agents/:id/skills/:skillId', unlink);
```
Removed route shipped as a PATCH, no changelog.

**Good**
```diff
 // package.json
-  "version": "1.4.2",
+  "version": "2.0.0",
 // CHANGELOG.md
+## 2.0.0
+- BREAKING: removed DELETE /agents/:id/skills/:skillId, use DELETE /agents/:id/skills.
```

## Severity guidance
- CRITICAL: a clear breaking change with no MAJOR bump (or `0.x` MINOR) where versions are managed in the repo.
- WARNING: missing changelog/migration note, wrong bump size for additive changes, in-place edit of a `/v1` surface.
- SUGGESTION: fix or additive change versioned slightly off, or version handled outside the diff.
- Anti-inflation: additive optional changes are never above SUGGESTION.
