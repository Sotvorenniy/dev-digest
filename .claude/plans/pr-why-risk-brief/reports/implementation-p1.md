# Implementation Report — Phase 1 (Steps 1-4) — done
Files: server+client vendor/shared/contracts/brief.ts (byte-identical), client/src/lib/types.ts, server/src/modules/brief/{constants,domain,prompt,ports,repository}.ts, server/src/prompts/brief.system.md
Checks: check-changed server client PASS (typecheck, 300+186 tests, onion); server --full PASS (433 tests).
Hand-off notes for Phase 2:
- assembleBriefPrompt returns truncated.files/callers = budget cuts only; service must add leftOut (buildPromptFiles) and callersLeftOut (capCallerPaths). description/issueBody truncation set by prompt.
- specsUsed = spec labels as given; prompt label is spec:<label>; pass path as label.
- BriefModelOutputShape structural in domain.ts; BriefModelOutput (zod) in prompt.ts.
- MissingInputsArgs.intent takes {head_sha}|null|undefined; issue takes unknown|null (live-fetched issue).
- Spec skip rule: a spec that does not fit is skipped, later smaller specs may still be added.
Not run: brief tests (test-writer), --it lane.
