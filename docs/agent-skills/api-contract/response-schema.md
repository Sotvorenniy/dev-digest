# response-schema

Flag any change to the shape or format of an API response that consumers parse, including success bodies, error bodies and pagination.

## What counts
- A response field removed, renamed or retyped (string to number, object to string).
- Nullability changed: a field that was always present becomes `.nullish()`/`.optional()`, or `.nullable()` becomes non-null.
- Envelope change: bare array to `{ items: [] }`, object wrapped in `{ data }`, or the reverse.
- Pagination shape change: `page/limit` to `cursor`, `total` dropped, `next` renamed.
- Error body change: `{ error: string }` to `{ code, message }`, changed error `code` values.
- Casing drift between snake_case and camelCase in wire fields (this repo's wire fields are snake_case).
- Schema and handler drift: handler returns a field the Zod/OpenAPI response schema does not declare, or the schema declares one the handler no longer returns.

## What does NOT count
- New optional response fields appended to an object.
- Reordering of object keys.
- Changes to internal DTOs or DB rows that are mapped before serialization.
- Documentation or `.describe()` text edits.

## How to check
1. Find response schemas in the diff: Zod `*Response`/`*Schema`, Fastify `schema: { response: { 200: ... } }`, OpenAPI `responses:`, exported TS response types.
2. Find the handler's `return` / `reply.send(...)` for the same route.
3. Compare old and new shape field by field, including nullability and casing.
4. Check that the schema and the handler agree with each other after the change.
5. Check clients or fixtures in the diff that read the field; a client updated in the same PR does not make it non-breaking for other consumers.

## Examples
**Bad**
```diff
 const RepoOut = z.object({
   id: z.string(),
-  default_branch: z.string(),
+  defaultBranch: z.string(),
 });
-  return reply.send(repos);
+  return reply.send({ items: repos });
```
Field renamed, casing drifted, envelope changed.

**Good**
```diff
 const RepoOut = z.object({
   id: z.string(),
   default_branch: z.string(),
+  visibility: z.string().optional(),
 });
   return reply.send(repos);
```

## Severity guidance
- CRITICAL: field removed/renamed/retyped, envelope or pagination shape changed, error body changed, on an existing route.
- WARNING: nullability loosened, casing drift on a new field, schema/handler disagree, or unclear blast radius.
- SUGGESTION: additive optional fields, style inconsistencies worth noting.
- Anti-inflation: additive optional changes are never above SUGGESTION.
