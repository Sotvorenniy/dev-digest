# Test Report — SPEC-03 (test-writer)
New/extended: server/test/{contracts (ext, 5), brief-domain (31), brief-prompt (10), brief-service (22), brief-wiring (3)}.test.ts; server/test/brief.it.test.ts (13); client PrBriefCard/{helpers.test.ts (11), PrBriefCard.test.tsx (22)}; OverviewTab/OverviewTab.test.tsx (3); [number]/page.test.tsx (3); DiffTab/DiffTab.test.tsx (ext, +9); e2e/specs/09-pr-brief.flow.json (19 steps).
Pinned: F1 token head SHA (it), F2 5,000 callers + over-budget, F3, F4 wiring, F6 scroll once / late Smart Diff / remount, F7c empty body JSON content-type, F7d live region, F7f dedupe, F7g banner newest-with-verdict, NFR3 429, NFR7 GET p95, EC15 corrupt row, workspace isolation.
Commands: check-changed server client --full PASS (server 504, client 298, typecheck, onion). server --it: brief.it 13/13 PASS; 2 pre-existing failures outside feature (conventions-rescan-preserves-decisions.it line 144 — fails on clean HEAD; reviews.it hangs only with local server/.env present).
Not run: e2e flow (agent-browser not installed, e2e.sh needs pnpm) — JSON + e2e tsc OK; next build; visual scroll/highlight.
Deviations: no user-event installed → fireEvent + el.focus(); e2e clicks src/config.ts:11 (seeded lines 11,13; plan said :12).
Production bugs: none. Doc: e2e/README.md needs 09-pr-brief row.
Suggested INSIGHTS: user-event not installed; rerender needs fresh element; 429 test needs own dev app; reviews.it/.env sensitivity.
