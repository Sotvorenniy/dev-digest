# breaking-change

Flag any change that removes or alters a public API contract in a way that breaks a caller written against the previous version.

## What counts
- A route or HTTP method removed or renamed: an `app.get('/x')` / `router.post('/x')` / `fastify.route({ url })` line deleted or its path changed.
- A new required request field, query param or header; a previously optional field made required.
- A request or response field removed or its type changed (`z.string()` to `z.number()`, scalar to array).
- An enum or union value removed (`z.enum([...])`, TS `type X = 'a' | 'b'`, OpenAPI `enum:`).
- A status code changed for an existing outcome (200 to 201, 404 to 400, 200 to 204 where callers read a body).
- Auth newly required on a route that was open (added `preHandler`/`onRequest` guard, OpenAPI `security:`).
- An exported TS type or interface in a shared contract package that loses or retypes a member.

## What does NOT count
- A brand-new route or schema with no prior callers.
- A new OPTIONAL request field, a new response field added alongside existing ones, a new enum value.
- Internal-only types that are never serialized over the wire.
- Refactors that keep the wire shape identical (moved handler, renamed local variable).

## How to check
1. List every route registration, Zod schema, exported type and OpenAPI file touched by the diff.
2. For each, compare the `-` lines to the `+` lines field by field: path, method, params, body, response, status, auth.
3. Ask for each old field: would a caller using the OLD contract still work unchanged? If not, that is a finding.
4. Cite the file:line of the changed line and state old shape versus new shape.
5. A deleted line with no matching `+` line elsewhere in the diff means removal, not a move.

## Examples
**Bad**
```diff
-  app.get('/repos/:id/pulls', listPulls);
+  app.get('/repos/:id/pull-requests', listPulls);
 const CreateAgent = z.object({
   name: z.string(),
+  model: z.string(),          // new REQUIRED field
 });
```
Old callers get 404 and 400.

**Good**
```diff
   app.get('/repos/:id/pulls', listPulls);
+  app.get('/repos/:id/pull-requests', listPulls); // alias, old path kept
 const CreateAgent = z.object({
   name: z.string(),
+  model: z.string().optional(),
 });
```

## Severity guidance
- CRITICAL: route/method removed or renamed, required input added, field removed or retyped, enum value removed, status code changed, auth added, on an API that already has callers.
- WARNING: same kinds of change but only on an apparently internal or unused field, or blast radius unclear.
- SUGGESTION: additive and optional changes worth noting (new optional field, new enum value).
- Anti-inflation: additive optional changes are never above SUGGESTION. Do not report speculative breakage as CRITICAL.
