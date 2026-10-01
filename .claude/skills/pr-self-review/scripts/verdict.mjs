#!/usr/bin/env node
// Writes, checks and prints the self-review verdict.
//   node verdict.mjs write --plan P.json --mechanical M.json --llm L.json
//   node verdict.mjs check      → exit 0 only when a PASS verdict matches the current changes
//   node verdict.mjs report     → markdown report of the stored verdict
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VERDICT_FILE, collect, readJson } from './lib.mjs';

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/** Flatten LLM output ([{skill, findings}] or [finding]), normalise, merge duplicates. */
export function normalise(mechanical, llm) {
  const flat = [...(mechanical.findings ?? [])];
  for (const entry of llm ?? []) {
    if (Array.isArray(entry?.findings)) {
      for (const f of entry.findings) flat.push({ source: `skill:${entry.skill}`, ...f });
    } else if (entry) flat.push(entry);
  }
  const merged = new Map();
  for (const raw of flat) {
    const severity = String(raw.severity ?? 'LOW').toUpperCase();
    const f = { ...raw, severity: SEVERITIES.includes(severity) ? severity : 'LOW' };
    // Same spot flagged by two skills (e.g. react + frontend-ui) → one finding, both sources.
    const key = f.line != null ? `${f.file}:${f.line}` : `${f.file}:${f.rule}:${f.source}`;
    const prev = merged.get(key);
    if (!prev) merged.set(key, f);
    else {
      const keep = SEVERITIES.indexOf(f.severity) < SEVERITIES.indexOf(prev.severity) ? f : prev;
      merged.set(key, { ...keep, source: [...new Set([...prev.source.split(', '), f.source])].join(', ') });
    }
  }
  return [...merged.values()].sort(
    (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || String(a.file).localeCompare(String(b.file)),
  );
}

export function decide(findings, errors) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));
  const verdict = counts.CRITICAL > 0 ? 'BLOCKED' : errors.length > 0 ? 'INCOMPLETE' : 'PASS';
  return { verdict, counts };
}

/** Compare the stored verdict with the current working tree. */
export function check() {
  const stored = readJson(VERDICT_FILE(), null);
  if (!stored) return { status: 'MISSING', message: 'No self-review verdict yet.' };
  const now = collect();
  if (stored.diff_hash !== now.diff_hash) {
    return { status: 'STALE', message: 'Changes differ from the reviewed ones.', stored, now };
  }
  return { status: stored.verdict, stored, now };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

export function report(v) {
  const lines = [];
  lines.push(`## PR self-review: ${v.verdict}`);
  lines.push('');
  lines.push(`Base \`${v.base_ref}\` @ ${v.base.slice(0, 8)} · HEAD ${v.head.slice(0, 8)}${v.dirty ? ' + uncommitted changes' : ''}`);
  lines.push(`Counts: ${SEVERITIES.map((s) => `${s} ${v.counts[s]}`).join(' · ')}`);
  lines.push('');
  if (v.findings.length) {
    lines.push('| Severity | Where | Source | Rule | Summary | Fix |');
    lines.push('|---|---|---|---|---|---|');
    for (const f of v.findings) {
      const where = f.line != null ? `${f.file}:${f.line}` : f.file;
      const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${f.severity}${f.downgraded ? ' ↓' : ''} | \`${where}\` | ${cell(f.source)} | ${cell(f.rule)} | ${cell(f.summary)} | ${cell(f.fix)} |`);
    }
    lines.push('');
  }
  if (v.errors?.length) {
    lines.push('Gates that could not run (verdict is INCOMPLETE until they do):');
    for (const e of v.errors) lines.push(`- **${e.gate}** — ${e.message}`);
    lines.push('');
  }
  lines.push('Skills run:');
  for (const [skill, files] of Object.entries(v.skills_run ?? {})) lines.push(`- \`${skill}\` — ${files.length} file(s)`);
  if (v.not_covered?.length) lines.push(`\nNot covered by any skill: ${v.not_covered.map((p) => `\`${p}\``).join(', ')}`);
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === 'write') {
    const plan = readJson(arg('--plan'), null);
    const mechanical = readJson(arg('--mechanical'), null);
    const llm = readJson(arg('--llm'), []);
    if (!plan || !mechanical) {
      console.error('verdict write: --plan and --mechanical are required (outputs of route.mjs / mechanical.mjs)');
      process.exit(1);
    }
    const now = collect();
    if (plan.diff_hash !== now.diff_hash || mechanical.diff_hash !== now.diff_hash) {
      console.error('verdict write: files changed while the review ran — re-run /pr-self-review.');
      process.exit(1);
    }
    const findings = normalise(mechanical, llm);
    const errors = mechanical.errors ?? [];
    const out = {
      ...decide(findings, errors),
      base: now.base,
      base_ref: now.base_ref,
      head: now.head,
      dirty: now.dirty,
      diff_hash: now.diff_hash,
      findings,
      errors,
      skills_run: plan.skills,
      not_covered: plan.not_covered,
      ts: new Date().toISOString(),
    };
    mkdirSync(dirname(VERDICT_FILE()), { recursive: true });
    writeFileSync(VERDICT_FILE(), JSON.stringify(out, null, 2) + '\n');
    console.log(report(out));
    console.log(`\nPR SELF REVIEW: ${out.verdict}${out.counts.CRITICAL ? ` (${out.counts.CRITICAL} critical)` : ''}`);
  } else if (cmd === 'check') {
    const r = check();
    console.log(JSON.stringify({
      status: r.status,
      message: r.message,
      counts: r.stored?.counts,
      head: r.now?.head,
      dirty: r.now?.dirty,
    }));
    process.exit(r.status === 'PASS' ? 0 : 1);
  } else if (cmd === 'report') {
    const v = readJson(VERDICT_FILE(), null);
    if (!v) {
      console.error('No verdict yet — run /pr-self-review.');
      process.exit(1);
    }
    console.log(report(v));
  } else {
    console.error('usage: verdict.mjs write|check|report');
    process.exit(1);
  }
}
