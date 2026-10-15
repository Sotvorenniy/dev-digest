# Cross-model review — pr-why-risk-brief plan

- Date: 2026-10-15
- Plan: `.claude/plans/pr-why-risk-brief.md` (planner: Opus 5.5)
- Spec: `specs/2026-10-15-pr-why-risk-brief.md` (SPEC-03)
- Reviewer: Claude Sonnet 5.5, read-only. A non-Claude model family was not available here: no Codex or Gemini CLI is installed, and Fable is excluded by budget.
- Verdict: **ready with fixes**. No CRITICAL findings; 1 HIGH, 6 MEDIUM, 9 LOW. All AC1–AC18 and NFR1–NFR11 map to steps and tests. More than 40 code anchors were spot-checked and found accurate.

## What it found
1. **HIGH — stale SHA with a GitHub token.**
   - With a token, `GET /pulls/:id` refreshes `pr_files` but never writes back `head_sha` (`server/src/modules/pulls/routes.ts:295-305`).
   - A fresh brief is therefore stamped with the old SHA, and the stale note shows right away (AC6, AC10).
   - Fix: persist `headSha` in that refresh update, and add a test for the token path.
2. **MEDIUM — prompt budget not guaranteed.**
   - The blast summary and callers have no cap, and the ripgrep fallback is uncapped.
   - The plan has no over-budget path, so NFR2 (40k tokens) can be broken.
   - Fix: cap the blast summary and caller paths, and record the cut in `truncated`.
3. **MEDIUM — output token cap of 2,000 is too small.**
   - A truncated JSON answer becomes `schema_mismatch`, and the spec allows no re-ask.
   - Fix: raise the cap to 4–6k.
4. **MEDIUM — "exactly one HTTP call" is not proven.**
   - The tests inject a fake provider, so a wiring slip to `llm()` instead of `llmSingleShot()` would still pass.
   - Fix: add a wiring test.
5. **MEDIUM — Phase 3 is too big for one implementer run.**
   - Fix: split it into 3a (card) and 3b (diff focus and P3).
6. **MEDIUM — diff focus effect is fragile.**
   - The effect can re-scroll on every re-render, and FileCards remount when Smart Diff loads late.
   - Fix: key the effect on `file` and `line`, and use refs, not `querySelector`.
7. **LOW — the remaining nine findings:**
   - Step 5 import list misses `smart-diff/domain`.
   - The `schema_mismatch` regex is loose.
   - An empty POST body with a JSON content-type is rejected by Fastify.
   - The `aria-live` region must always be mounted, and visible focus is not addressed.
   - The linked-issue fetch needs a short timeout.
   - Duplicate Review focus items are not deduped, and cap drops are not counted in `file_refs`.
   - The P3 banner source is ambiguous for a "summary" run.
   - Seed side effects on e2e flows 04 and 05 are unchecked.
   - The POST has no response schema.
   - The i18n key `unavailable` is left dead.

## Verified correct
- Both `brief.ts` copies are identical, and nothing else consumes `PrBrief`.
- `.nullish()` is used on stored JSON.
- `maxRetries: 0` plus `transportRetries: 0` gives one attempt.
- Grounding uses `groundFindings` unchanged.
- `wrapUntrusted` escaping is correct.
- No error carries the raw model output.
- depcruise layering complies.
- Client imports from `@devdigest/shared` are type-only, and links are URL-encoded.
- Phase dependencies are acyclic.

## Outcome
The user accepted all findings, with finding 1 fixed by persisting `headSha` on refresh. implementation-planner revised the plan to address every finding; §0 of the plan maps each finding to its step.

Plan changes:
- F1: new Step 8 adds `headSha` to the refresh update, with a token-path test.
- F2: caps on the blast summary (2,000 chars) and on caller paths (100), plus an explicit over-budget cut order.
- F3: output cap raised to 5,000 tokens.
- F4: new `brief-wiring.test.ts`.
- F5: Step 5 split into Steps 5 and 6, and Phase 3 split into 3a and 3b.
- F6: the focus effect runs once per (file, line), and uses refs.
- F7: all LOW items addressed.

Two items beyond the spec go back to spec-creator: the extra `BriefTruncated.callers` and `blast_summary` fields, and the head SHA fix in `pulls/routes.ts`.
