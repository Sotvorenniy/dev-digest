# Implementation Report — Phase 3 (server)
Steps 4-8 done.
New: server/src/ports/project-docs.ts, server/src/adapters/project-docs/fs-project-docs.ts, server/src/modules/project-context/{domain,ports,repository,service,routes}.ts.
Edited: platform/config.ts (PROJECT_CONTEXT_ROOTS, ';'-split), platform/container.ts, adapters/index.ts, modules/index.ts, reviews/run-executor.ts (5th ctor arg, resolveProjectContext, try/catch, metadata-only Live Log), reviews/service.ts, server/.env.example, test/prompt-log-executor.test.ts (no-op fake ctor arg).
Deviations (minor): requireRepo uuid-checks repo_id -> 404 repo_not_found instead of PG 500; list estimates ceil(size/4) for files > 64 KiB without reading.
Checks: check-changed.sh server per step PASS (typecheck, 125 related tests, onion gate w/ 8 known baseline).
--full --it: typecheck PASS, onion PASS; tests 3 failed / 314 passed:
 - conventions-rescan-preserves-decisions.it.test.ts "rescan wipes only pending rows"
 - reviews.it.test.ts "runs a review: map-reduce + grounding…", "finding actions: accept, dismiss"
Orchestrator verified on clean HEAD worktree: the same 2 files fail there too (4 failed / 3 passed). Pre-existing, not caused by this change.
Not run: new tests (tests off), app.inject smoke of 5 routes.
Suggested INSIGHTS (server): ';' separator for env globs; uuid-check plain-string ids before PG uuid columns; reviews/conventions it tests fail on clean base.
