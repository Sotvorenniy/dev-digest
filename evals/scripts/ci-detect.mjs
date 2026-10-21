/**
 * CI change detector for the harness evals.
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *   any CLAUDE.md / AGENTS.md / INSIGHTS.md (root or nested) / any agent / engine change → run the workflow tier
 *
 * A changed artifact with NO written evals is NOT a failure: it is reported on the `skipped_*`
 * outputs so the job can print a visible "SKIP <name> (no evals)" line instead of going red.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents)
 * to $GITHUB_OUTPUT. Pure filesystem + string work — no deps.
 */

import { existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(EVALS_DIR, "..");

const changed = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

/** Does evals/<tier>/<name>/ contain at least one *.eval.ts? */
function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

const skillNames = touched(
  /^\.claude\/skills\/([^/]+)\//,
  /^evals\/skills\/([^/]+)\//,
);
const agentNames = touched(
  /^\.claude\/agents\/(?!README\.md$)([^/]+)\.md$/,
  /^evals\/agents\/([^/]+)\//,
);

// Budget cap: at most MAX_SUITES matrix legs per tier. Anything over the cap is reported as a
// skip, so a PR that touches every skill cannot fan out into an unbounded model bill.
const MAX_SUITES = Number(process.env.MAX_SUITES ?? 6);
const split = (tier, names) => {
  const withEvals = names.filter((n) => hasEvals(tier, n));
  return {
    run: withEvals.slice(0, MAX_SUITES),
    skipped: [
      ...names.filter((n) => !hasEvals(tier, n)),
      ...withEvals.slice(MAX_SUITES).map((n) => `${n}(over MAX_SUITES=${MAX_SUITES})`),
    ],
  };
};
const { run: skills, skipped: skippedSkills } = split("skills", skillNames);
const { run: agents, skipped: skippedAgents } = split("agents", agentNames);

// The workflow tier measures the LIVE harness, so anything that changes it re-triggers it:
// the root or .claude CLAUDE.md, any agent definition, the workflow cases, or the engine itself.
const runWorkflow = changed.some(
  (f) =>
    /(^|\/)(CLAUDE|AGENTS|INSIGHTS)\.md$/.test(f) ||
    /^\.claude\/agents\/(?!README\.md$).+\.md$/.test(f) ||
    /^evals\/workflow\//.test(f) ||
    /^evals\/src\//.test(f),
);

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

write("skills", JSON.stringify(skills));
write("agents", JSON.stringify(agents));
write("run_workflow", String(runWorkflow));
write("skipped_skills", skippedSkills.join(" "));
write("skipped_agents", skippedAgents.join(" "));

// Human-readable summary in the step log.
console.error("── eval change detection ──");
console.error(`changed files : ${changed.length}`);
console.error(`skills → run  : ${skills.join(", ") || "(none)"}`);
console.error(`agents → run  : ${agents.join(", ") || "(none)"}`);
console.error(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
if (skippedSkills.length) console.error(`SKIP skills (no evals): ${skippedSkills.join(", ")}`);
if (skippedAgents.length) console.error(`SKIP agents (no evals): ${skippedAgents.join(", ")}`);

// Visible annotations + job summary so a skipped artifact never looks like a silent pass.
for (const n of skippedSkills) console.log(`::notice title=SKIP skill ${n}::no evals under evals/skills/${n}`);
for (const n of skippedAgents) console.log(`::notice title=SKIP agent ${n}::no evals under evals/agents/${n}`);
const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  const row = (kind, name, verdict) => `| ${kind} | ${name} | ${verdict} |\n`;
  let md = "### Eval change detection\n\n| kind | name | verdict |\n|---|---|---|\n";
  for (const n of skills) md += row("skill", n, "run");
  for (const n of skippedSkills) md += row("skill", n, "SKIP (no evals)");
  for (const n of agents) md += row("agent", n, "run");
  for (const n of skippedAgents) md += row("agent", n, "SKIP (no evals)");
  md += row("workflow", "-", runWorkflow ? "run" : "skip");
  appendFileSync(summary, md);
}
