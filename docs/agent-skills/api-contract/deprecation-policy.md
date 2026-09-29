# deprecation-policy

Flag any API surface that is removed outright and suggest deprecating it first, with a replacement, a removal version or date, and an overlap period.

## What counts
- A route, field, query param or enum value deleted with no earlier deprecation visible in the repo or the diff.
- A deprecation that is incomplete: no replacement named, no removal version or date.
- Missing signals on something being phased out: `@deprecated` JSDoc on exported TS types/functions, OpenAPI `deprecated: true`, Zod `.describe('Deprecated: ...')`, `Deprecation` and `Sunset` response headers.
- Deprecating and removing in the same PR (no overlap period for callers to migrate).
- Replacement added without keeping the old surface working in the meantime.

## What does NOT count
- Removing something that was already marked deprecated with the announced version or date passed (mention the reference).
- Removing internal-only code or unreleased endpoints never available to callers.
- Adding `@deprecated` without removing anything: that is the correct behavior.

## How to check
1. Find deletions: removed route registrations, removed Zod fields, removed exported types, removed enum members, removed OpenAPI paths.
2. Search the diff context for a prior `@deprecated`, `deprecated: true`, `Deprecation`/`Sunset` header or changelog notice for each. If none, it is a silent removal.
3. For added deprecations, check they name the replacement and the removal version or date.
4. Check the old path still works (alias or handler retained) if the same diff adds the replacement.
5. Suggest the concrete fix: keep the surface, mark it, set headers, remove in the named release.

## Examples
**Bad**
```diff
-  app.get('/skills/list', listSkills);
+  app.get('/skills', listSkills);
```
Old path silently gone.

**Good**
```diff
   app.get('/skills', listSkills);
+  /** @deprecated use GET /skills. Removal in 3.0.0 (2026-12-01). */
   app.get('/skills/list', async (req, reply) => {
+    reply.header('Deprecation', 'true');
+    reply.header('Sunset', 'Tue, 01 Dec 2026 00:00:00 GMT');
     return listSkills(req, reply);
   });
```

## Severity guidance
- CRITICAL: a public route, field or enum value removed with no prior deprecation, no replacement and no notice, on an API with callers.
- WARNING: deprecation missing replacement or removal date, deprecate-and-remove in one PR, missing headers.
- SUGGESTION: add `@deprecated` or `deprecated: true` metadata for something clearly being phased out.
- Anti-inflation: additive optional changes are never above SUGGESTION; a well-formed deprecation is not a finding.
