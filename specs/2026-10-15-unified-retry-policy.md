# SPEC-04: Unified retry policy for external calls

Status: approved
Scope: server (`platform/resilience.ts`, `platform/config.ts`, `platform/jobs.ts`, `db/schema/ops.ts`)

## Problem

Retry behaviour for GitHub, LLM providers and background jobs is hard-coded in `withRetry` (3 retries, 8 s max delay). Operators cannot tune it, and a job row does not show how many attempts it is allowed or when it last retried.

## Goals

- G1. One configurable retry budget for every external call.
- G2. A job row records its retry budget and its last retry time.
- G3. No behaviour change for callers that pass explicit `retries`.

## Non-goals

- Per-provider retry budgets.
- Retrying LLM calls that already have `maxRetries: 0` (single-shot providers such as the PR brief).

## Acceptance criteria (EARS)

- AC1. The server shall read `RETRY_MAX_ATTEMPTS` (integer >= 0, default 5) and `RETRY_MAX_DELAY_MS` (integer >= 0, default 30000) from the environment.
- AC2. When a caller of `withRetry` passes no `retries`, the system shall use `RETRY_MAX_ATTEMPTS`.
- AC3. When a caller passes `retries`, the system shall use that value unchanged.
- AC4. The system shall retry only on HTTP 408, 429 and 5xx, and on the network errors `ECONNRESET`, `ETIMEDOUT` and `ENOTFOUND`.
- AC5. The system shall never retry a 4xx error other than 408 and 429.
- AC6. When a job retries, the system shall set `jobs.last_retry_at` to the retry time.
- AC7. When a job is enqueued, the system shall store `jobs.max_attempts` as its retries + 1.
- AC8. The migration shall be additive only: new columns are nullable or have a default, so existing rows stay valid.

## Non-functional requirements

- NFR1. The worst-case total wait of one call shall stay under 2 minutes with default settings.
- NFR2. A new runtime dependency needs a lockfile update in the same PR (`pnpm-lock.yaml`).

## Risks

- `withRetry` is shared by the GitHub client, both LLM adapters and the job queue. A wider retry predicate multiplies cost on LLM calls and can hide permanent failures.
- Raising default retries from 3 to 5 with a 30 s cap can make a failing job hold a queue slot for minutes.
