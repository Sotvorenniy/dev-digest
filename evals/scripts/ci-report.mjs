/**
 * CI report for one eval tier: per-case score vs the committed baseline, written to the job
 * summary. Model runs are a REPORT, not a pass/fail gate: the job fails only on
 *   - a regression: score fell below baseline.json by more than max(REGRESSION_TOLERANCE, one
 *     judge practice), i.e. two flaky practices, not one, or
 *   - an infrastructure failure: the eval step failed and produced no records at all.
 * Cases with no baseline entry are reported as "new". Token use is tallied against a budget.
 *
 *   node scripts/ci-report.mjs <tier>            report (reads results/records.jsonl)
 *   node scripts/ci-report.mjs --write-baseline [--runs N] [--merge] [--only <substring>]
 *                                                rewrite evals/baseline.json (mean over the last N runs;
 *                                                --merge refreshes only the cases present in those runs)
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

/** Records of the last `n` distinct runs (default 1), in file order. */
function lastRuns(n = 1) {
  if (!existsSync(RECORDS)) return [];
  const rows = readFileSync(RECORDS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const ids = [...new Set(rows.map((r) => r.run_id))].slice(-n);
  return rows.filter((r) => ids.includes(r.run_id));
}
const latestRun = () => lastRuns(1);

/** An API-level failure (credits, rate limit, 5xx) is not an eval regression: classify it apart. */
function apiError(r) {
  try {
    const text = readFileSync(join(EVALS_DIR, "results", r.output_file ?? ""), "utf8");
    // An API failure IS the whole output, so look only at the start: matching "rate limit" anywhere
    // flagged a normal answer that merely mentioned it.
    return /API Error: (402|403|429|5\d\d)|exceed your available credits|key limit exceeded|failed to authenticate|too many requests/i.exec(text.slice(0, 400))?.[0] ?? null;
  } catch {
    return null;
  }
}

const arg = process.argv[2];
const rows = latestRun();

if (arg === "--write-baseline") {
  // --runs N averages each case's score over the last N runs (a repeat series); default 1.
  const runsIdx = process.argv.indexOf("--runs");
  const n = runsIdx > -1 ? Number(process.argv[runsIdx + 1]) : 1;
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : "";
  const acc = {};
  for (const r of lastRuns(n)) {
    if (only && !r.nodeid.includes(only)) continue;
    if (typeof r.score !== "number" || apiError(r)) continue; // trace cases have no score; API errors are not data
    (acc[keyOf(r.nodeid)] ??= []).push(r.score);
  }
  // --merge keeps every other case's baseline and only refreshes the cases seen in these runs.
  const out = process.argv.includes("--merge") && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
  for (const [k, v] of Object.entries(acc)) out[k] = Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(2));
  writeFileSync(BASELINE, JSON.stringify(out, null, 2) + "\n");
  console.log(`baseline.json: ${Object.keys(out).length} cases, mean over the last ${n} run(s)`);
  process.exit(0);
}

const tier = arg ?? "evals";
const tolerance = Number(process.env.REGRESSION_TOLERANCE ?? 0.2);
const budget = Number(process.env.EVAL_TOKEN_BUDGET ?? 1_500_000);
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};

let md = `### ${tier} evals vs baseline\n\n| case | score | threshold | baseline | delta | status |\n|---|---|---|---|---|---|\n`;
let regressions = 0;
let apiErrors = 0;
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
  const api = apiError(r);
  if (api) apiErrors++;
  const regressed = !api && delta !== null && delta < -slack;
  if (regressed) regressions++;
  tokens += (r.metrics?.inputTokens ?? 0) + (r.metrics?.outputTokens ?? 0);
  const status = api ? `API ERROR (${api})` : regressed ? "REGRESSION" : r.outcome ? "pass" : base === undefined ? "new (below threshold)" : "below threshold, within baseline";
  const short = key.split(" > ").slice(-2).join(" > ");
  md += `| ${short} | ${scored ? r.score.toFixed(2) : r.outcome ? "pass" : "fail"} | ${r.threshold ?? "-"} | ${base ?? "-"} | ${delta === null ? "-" : delta.toFixed(2)} | ${status} |\n`;
}
md += `\nTokens (in+out): ${tokens} of budget ${budget}. Records: ${rows.length}.\n`;
if (!rows.length) md += "\nNo records were produced.\n";

console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
if (tokens > budget) console.log(`::warning title=${tier} token budget::${tokens} tokens used, budget ${budget}`);

if (apiErrors) console.log(`::error title=${tier} API errors::${apiErrors} case(s) hit an API error (credits / key limit / rate limit): scores are not meaningful, fix the OpenRouter key or balance, not the evals`);
const infraFailure = (process.env.EVAL_OUTCOME === "failure" && rows.length === 0) || apiErrors > 0;
if (process.env.EVAL_OUTCOME === "failure" && rows.length === 0) console.log(`::error title=${tier} evals::the eval step failed and produced no records`);
if (regressions) console.log(`::error title=${tier} regression::${regressions} case(s) fell more than ${tolerance} below baseline`);
process.exit(infraFailure || regressions ? 1 : 0);
