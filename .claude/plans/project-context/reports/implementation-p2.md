# Implementation Report — Phase 2 (reviewer-core)
Step 3 done. No deviations.
Files: reviewer-core/src/prompt.ts (SpecEntry, escapeLabel, wrapUntrusted escapes label, PromptParts.specs: SpecEntry[]), reviewer-core/src/review/run.ts (ReviewInput.specs: SpecEntry[]), reviewer-core/src/index.ts (export type SpecEntry).
Check `check-changed.sh reviewer-core server --full`: reviewer-core typecheck PASS, tests 79 PASS; server typecheck PASS, tests 258 PASS, onion gate PASS (8 known baseline).
Note: label escaping also applies to existing callers (convention-scan f.path, server skill:${name}). No byte-identity test written (tests off).
