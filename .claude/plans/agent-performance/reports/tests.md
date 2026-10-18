# Test Report (SPEC-04) — PASS
- New/extended: server/test/{contracts.test.ts (ext), agent-performance-domain.test.ts (17), agent-performance-service.test.ts (6), agent-performance.it.test.ts (12), agent-performance-perf.it.test.ts (NFR1, p95<=1s at 10k runs/50k findings)}; client: app-shell/helpers.test.ts (ext), AgentPerformanceView/helpers.test.ts (20), AgentPerformanceView.test.tsx (23).
- check-changed server client --full: PASS (server 538, client 363, onion PASS).
- check-changed server --it: 2 FAIL in test/reviews.it.test.ts (known pre-existing, server INSIGHTS clean-HEAD entry); all SPEC-04 IT tests pass (13).
- Row-key collision: not possible — server merges all deleted-agent runs into one row (domain + IT tests).
- Route precedence and 422 on bad from/to proven by IT.
- Not covered: visual layout (jsdom), relative Last-run text, e2e.
- Suggested INSIGHTS: client — th with labelled button has no usable columnheader name in DTL; use button.closest("th") for aria-sort.
