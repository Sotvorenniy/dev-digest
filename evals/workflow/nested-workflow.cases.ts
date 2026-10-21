import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic tier — root CLAUDE.md/AGENTS.md routing and nested package instructions. Entering a
 * package makes the agent follow that package's own AGENTS.md ("Before answering", "Use when"),
 * on top of the root CLAUDE.md.
 *
 * A nested CLAUDE.md is auto-loaded by the harness, not opened with Read, so it may not show up in
 * `filesRead`. Each case therefore asserts the DOWNSTREAM reads: files that only an AGENTS.md
 * points to. Reading them is the proof the instructions were followed.
 *
 * One `trace` session per package folds every "Use when" row of that package into a single
 * numbered prompt (cheaper, coarser). Prompts never name the target files — that would stop
 * testing the routing. A failed case lists `reads:`, so the missing file is still visible.
 *
 * Every path asserted below exists in THIS repo.
 *
 * Budget: 7 Claude sessions total.
 *   - 4 × trace (root, server, client, mcp + reviewer-core)   = 4
 *   - 1 × contrast (treatment + control)                      = 2
 *   - 1 × activation (pr-self-review)                         = 1
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): root CLAUDE.md -> AGENTS.md "Use when" ---------------------------------
  {
    kind: "trace",
    name: "root instructions route to README, agent-prompts, skill-evals and INSIGHTS",
    prompt:
      "Follow this repo's root instructions for each of these four tasks. Open the document they " +
      "point to for each one, then answer in one line per task and quote the first heading of each " +
      "document you opened (an answer without a quoted heading does not count):\n" +
      "1. I need the quick start and the troubleshooting steps for a clean machine.\n" +
      "2. I am writing a system prompt for a new review agent.\n" +
      "3. I am adding evals for a skill.\n" +
      "4. I want to see cross-cutting findings that earlier sessions recorded.",
    expectFilesRead: [
      "README.md",
      "docs/agent-prompts/README.md",
      "skill-evals/_shared/README.md",
      "INSIGHTS.md",
    ],
    maxTurns: 14,
  },

  // --- trace (1 session): server/AGENTS.md "Use when" + "Before answering" -----------------------
  {
    kind: "trace",
    name: "server instructions route to README, docs, TESTING and INSIGHTS",
    prompt:
      "I am working in the server package. Follow this repo's instructions for that package. Open " +
      "the document they point to for each task, then answer in one line per task and quote the " +
      "first heading of each document you opened (an answer without a quoted heading does not count):\n" +
      "1. Where is the API map, env vars and DI flow described?\n" +
      "2. Where are the design notes and deep-dives?\n" +
      "3. I am adding a test that talks to the database: where is the unit versus integration split " +
      "explained?\n" +
      "4. I hit unexpected behaviour: where might it already be documented?",
    expectFilesRead: [
      "server/README.md",
      "server/docs/README.md",
      "TESTING.md",
      "server/INSIGHTS.md",
    ],
    maxTurns: 14,
  },

  // --- trace (1 session): client/AGENTS.md "Use when" + "Before answering" -----------------------
  {
    kind: "trace",
    name: "client instructions route to README, architecture, design system and INSIGHTS",
    prompt:
      "I am working in the client package. Follow this repo's instructions for that package. Open " +
      "the document they point to for each task, then answer in one line per task and quote the " +
      "first heading of each document you opened (an answer without a quoted heading does not count):\n" +
      "1. Where are the stack, the route map and the commands described?\n" +
      "2. I am changing how data flows through providers: where is that explained?\n" +
      "3. I am changing a design system component: where are the layers and theming described?\n" +
      "4. I hit unexpected behaviour: where might it already be documented?",
    expectFilesRead: [
      "client/README.md",
      "client/docs/architecture.md",
      "client/src/vendor/ui/README.md",
      "client/INSIGHTS.md",
    ],
    maxTurns: 14,
  },

  // --- trace (1 session): mcp + reviewer-core package instructions -------------------------------
  {
    kind: "trace",
    // The logging rule lives only in mcp/AGENTS.md (never write to stdout); opening it is the
    // deterministic proof that the agent entered the package and read its own instructions.
    name: "mcp and reviewer-core instructions route to their README, AGENTS and INSIGHTS",
    prompt:
      "Follow this repo's instructions for each of these package tasks. Open the document they " +
      "point to for each one, then answer in one line per task and quote the first heading of each " +
      "document you opened (an answer without a quoted heading does not count):\n" +
      "1. I want to change how the mcp package logs requests: tell me the logging rule.\n" +
      "2. I want to use the MCP server from Claude Code: where is that documented?\n" +
      "3. I am changing the review pipeline in reviewer-core: where is the pipeline documented?\n" +
      "4. In reviewer-core I hit unexpected behaviour: where might it already be documented?",
    expectFilesRead: [
      "mcp/AGENTS.md",
      "mcp/README.md",
      "reviewer-core/README.md",
      "reviewer-core/INSIGHTS.md",
    ],
    maxTurns: 14,
  },

  // --- contrast (2 sessions): nested instructions change behaviour ------------------------------
  {
    kind: "contrast",
    // Treatment loads the real harness; control runs in an empty tmpdir with no config. The file
    // is named only by client/AGENTS.md, so the control has no reason to open it.
    name: "client instructions are what route the agent to docs/architecture.md",
    prompt:
      "I am going to change how data flows through providers in the client package. Follow this " +
      "repo's instructions for working in that package and read the document they point to.",
    expectFileRead: "client/docs/architecture.md",
    maxTurns: 8,
  },

  // --- activation (1 session): root "Use when" -> /pr-self-review --------------------------------
  {
    kind: "activation",
    name: "pr-self-review activates before opening a PR",
    prompt: "I finished my changes on this branch and want to open a pull request. Am I ready?",
    skill: "pr-self-review",
    shouldActivate: true,
    maxTurns: 4,
  },
];
