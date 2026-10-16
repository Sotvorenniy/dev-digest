# Plan Verification: Onboarding Tour (SPEC-02) — scope code, round 2 (R4 re-verify)

Verdict: COMPLETE. Without `--with-tests` this is the final verification; §5 test items are not in scope (the §5 tests exist on disk and pass, see `verify-code-r1.md`).

- met: 6 items re-checked (files touched by review rounds 2-3): Step 3/4 candidate derivation, AC7 run-command grounding, NFR3, NFR4, plan README shell-line item (plan line 255), finding-16 mitigation. partial 0, not met 0.
- `server/src/modules/onboarding/domain.ts:120` `README_UNSAFE`; `domain.ts:228` filter; `constants.ts:27` `README_COMMAND_MAX_CHARS = 200`; test `server/test/onboarding-domain.test.ts:278`.
- No contradiction with plan or spec: only README install/run shell lines are required; simple commands are kept. The 200-char cap is new and not in the plan text (plan line 255) — note, not a defect.

## Commands
- `.claude/scripts/check-changed.sh server` — PASS typecheck · tests 215/215 (related) · onion gate.
