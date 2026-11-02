import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented: subagent dispatch and skill
 * activation. Package routing (README / docs / INSIGHTS reads) lives in nested-workflow.cases.ts.
 *
 * Every path asserted below is a file that exists in THIS repo.
 *
 * Budget: 5 Claude sessions total.
 *   - 1 × trace (both reviewers in one session)                = 1
 *   - 2 × activation pair (positive + near-miss negative)      = 4
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): both review subagents dispatched ---------------------------------------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from reviews/routes.ts.
    name: "API-route plan pulls the architecture-reviewer AND the security-reviewer",
    prompt:
      "I plan to add a NEW, not yet implemented endpoint GET /reviews/:id/export (returns the review " +
      "as markdown). The plan: a new route in the reviews module calls ReviewService.getById, renders " +
      "the findings to markdown in the route handler and returns it with content-type text/markdown. " +
      "That is the whole plan; do not ask me for more detail. Do not review the plan yourself and do not answer before both subagents have returned. " +
      "Your FIRST two actions must be two Task/Agent tool calls, one per subagent: the " +
      "architecture-reviewer to assess it against the onion layers, and the security-reviewer to " +
      "assess it for vulnerabilities.",
    expectSubagents: ["architecture-reviewer", "security-reviewer"],
    maxTurns: 10,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "I just found out why the pgvector query returned zero rows — the column dimension did not match " +
      "after the embedding model changed. I want to record this so we do not step on it again.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Explain how column dimensions work in pgvector and why a mismatch returns zero rows.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },

  // --- activation pair (2 sessions): dependency-checker ----------------------------------------
  {
    kind: "activation",
    name: "dependency-checker activates on a dependency audit request",
    prompt:
      "Check the dependencies of this repo: how heavy is each package and what should we clean up first?",
    skill: "dependency-checker",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining a version difference must NOT run the audit",
    prompt:
      "Explain what changed in zod 3 compared with zod 4 for schema refinements.",
    skill: "dependency-checker",
    shouldActivate: false,
    maxTurns: 8,
  },
];
