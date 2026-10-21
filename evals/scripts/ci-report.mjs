/**
 * CI report for one eval tier: per-case score vs the committed baseline, written to the job
 * summary. Model runs are a REPORT, not a pass/fail gate: the job fails only on
 *   - a regression: score fell below baseline.json by more than max(REGRESSION_TOLERANCE, one
 *     judge practice), i.e. two flaky practices, not one, or
 *   - an infrastructure failure: the eval step failed and produced no records at all.
 * Cases with no baseline entry are reported as "new". Token use is tallied against a budget.
 *
 *   node scripts/ci-report.mjs <tier>            report (reads results/records.jsonl)
 *   node scripts/ci-report.mjs --write-baseline  rewrite evals/baseline.json from the records
 *
 * Env: EVAL_OUTCOME (outcome of the vitest step), EVAL_TOKEN_BUDGET (default 1500000),
 *      REGRESSION_TOLERANCE (default 0.2), GITHUB_STEP_SUMMARY.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const RECORDS = join(EVALS_DIR, "results", "records.jsonl");
const BASELINE = join(EVALS_DIR, "baseline.json");

/** nodeid is absolute and carries the `> describe > test` chain: key it by repo-relative path. */
const keyOf = (nodeid) => nodeid.replace(/^.*\/evals\//, "");

function latestRun() {
  if (!existsSync(RECORDS)) return [];
  const rows = readFileSync(RECORDS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const last = rows.at(-1)?.run_id;
  return rows.filter((r) => r.run_id === last);
}

const arg = process.argv[2];
const rows = latestRun();

if (arg === "--write-baseline") {
  const out = {};
  for (const r of rows) out[keyOf(r.nodeid)] = Number(r.score.toFixed(2));
  writeFileSync(BASELINE, JSON.stringify(out, null, 2) + "\n");
  console.log(`baseline.json: ${Object.keys(out).length} cases from run ${rows[0]?.run_id}`);
  process.exit(0);
}

const tier = arg ?? "evals";
const tolerance = Number(process.env.REGRESSION_TOLERANCE ?? 0.2);
const budget = Number(process.env.EVAL_TOKEN_BUDGET ?? 1_500_000);
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};

let md = `### ${tier} evals vs baseline\n\n| case | score | threshold | baseline | delta | status |\n|---|---|---|---|---|---|\n`;
let regressions = 0;
let tokens = 0;
for (const r of rows) {
  const key = keyOf(r.nodeid);
  const base = baseline[key];
  // trace / activation cases (workflow tier) record only pass/fail: no score, no threshold.
  const scored = typeof r.score === "number";
  const delta = base === undefined || !scored ? null : r.score - base;
  // One judge practice is 1/n of the score, so a single flaky practice must not read as a
  // regression: allow at least one practice of slack (3 practices -> 0.34, 6 -> 0.2).
  const n = Array.isArray(r.practices) ? r.practices.length : 0;
  const slack = Math.max(tolerance, n ? 1 / n + 0.01 : 0);
  const regressed = delta !== null && delta < -slack;
  if (regressed) regressions++;
  tokens += (r.metrics?.inputTokens ?? 0) + (r.metrics?.outputTokens ?? 0);
  const status = regressed ? "REGRESSION" : r.outcome ? "pass" : base === undefined ? "new (below threshold)" : "below threshold, within baseline";
  const short = key.split(" > ").slice(-2).join(" > ");
  md += `| ${short} | ${scored ? r.score.toFixed(2) : r.outcome ? "pass" : "fail"} | ${r.threshold ?? "-"} | ${base ?? "-"} | ${delta === null ? "-" : delta.toFixed(2)} | ${status} |\n`;
}
md += `\nTokens (in+out): ${tokens} of budget ${budget}. Records: ${rows.length}.\n`;
if (!rows.length) md += "\nNo records were produced.\n";

console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
if (tokens > budget) console.log(`::warning title=${tier} token budget::${tokens} tokens used, budget ${budget}`);

const infraFailure = process.env.EVAL_OUTCOME === "failure" && rows.length === 0;
if (infraFailure) console.log(`::error title=${tier} evals::the eval step failed and produced no records`);
if (regressions) console.log(`::error title=${tier} regression::${regressions} case(s) fell more than ${tolerance} below baseline`);
process.exit(infraFailure || regressions ? 1 : 0);
