# Test Report: Project Context (SPEC-01) — §5 tests (test-writer, after run)

## Files (AC-IDs)
- reviewer-core `test/prompt.test.ts` (+9): AC9, AC12, NFR7, EC16, EC17. `test/run.test.ts` (+1): AC9, EC10, NFR5.
- server NEW `test/project-docs-path.test.ts` (33): AC1, AC5, NFR1, EC17. NEW `test/project-docs-fs.test.ts` (24): AC1, AC3, AC5, NFR1, NFR2, NFR4, EC3, EC7, EC9, EC18. NEW `test/project-context-domain.test.ts` (10): AC9-AC11, AC13, EC11, NFR2, NFR3. NEW `test/project-context-executor.test.ts` (13): AC9-AC13, EC12, EC19, EC20, NFR5, NFR9, AC15 `specs_read` half. `test/contracts.test.ts` (+5): AC13, NFR12. NEW `test/project-context.it.test.ts` (40, Docker): AC1, AC3-AC6, AC8, EC3, EC4, EC7, EC13, EC14, NFR1, NFR4, NFR6.
- client NEW `ContextView.test.tsx` (11): AC2-AC4, EC1, EC3, EC9, EC18, EC21, NFR2, NFR8, NFR11. NEW `ContextDocPicker.test.tsx` (11): AC7, EC2, EC4, NFR10, NG9. `AgentEditor.test.tsx` (+4): AC6, AC7. `SkillEditor.test.tsx` (+3): AC8. `RunTraceDrawer.test.tsx` (+6): AC14, NFR12.

## Commands
- `.claude/scripts/check-changed.sh server client reviewer-core --full` — PASS all: server 433, client 250, reviewer-core 89; onion gate PASS.
- `vitest run test/project-context.it.test.ts` — 40 passed (Docker up).
- `check-changed.sh server --full --it` — 539 passed, 2 failed, both outside project-context: `reviews.it.test.ts` (flaky: live OpenRouter intent call ~6 s vs 10 s `waitForPrRuns`), `conventions-rescan-preserves-decisions.it.test.ts:144` (conventions module, untouched).

## Deviations
- `fireEvent` instead of `userEvent` (`@testing-library/user-event` not installed).
- Editor tests mock `@/lib/api` so the real hooks run and the PUT URL/body are asserted.

## Defects found: none. ACs without a test: AC15 (manual by design; trace half covered).
## Not covered: layout (jsdom), keyboard-only operation, 429 on file route.
