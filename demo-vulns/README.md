# demo-vulns

Deliberately vulnerable code for testing the Security Reviewer agent and its evals.
Nothing here is imported or run by any package. All secrets are fake.

| File | Planted problem | Expected finding |
|---|---|---|
| `src/auth.ts` | hardcoded secret, non-constant-time compare, JWT `alg: none` accepted | must_find |
| `src/users-repo.ts` | SQL injection through string concatenation | must_find |
| `src/uploads.ts` | path traversal on user-supplied file name | must_find |
| `src/webhook.ts` | SSRF via user-supplied URL, shell command injection | must_find |
| `src/logger.ts` | bearer token written to the log | must_find |
| `src/safe-queries.ts` | parameterized query, validated path | must_not_flag |
