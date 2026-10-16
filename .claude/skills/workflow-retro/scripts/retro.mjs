#!/usr/bin/env node
// Retrospective of one Claude Code session that ran the agent pipeline: tokens, cache reads,
// tool calls, duration and parallelism per agent, including nested subagents, plus candidate
// actions. No dependencies — Node 20 built-ins only.
//
//   node retro.mjs analyze [--session <id>|latest] [--mode quick|deep] [--label <slug>]
//                          [--project-dir <dir>]
//        → writes .devdigest/cache/retro/<session>-<mode>.{md,json}, prints the markdown
//   node retro.mjs ledger --report <json> [--note "<actions taken>"] [--entry <md>] [--ledger <path>]
//        → appends one row to docs/retro/ledger/index.md (creates it with a header if missing);
//          --entry links the run's insight file (docs/retro/ledger/<date>-<label>.md)
//
// quick: the main session transcript plus the <usage> block of each task-notification
//        (in a user turn or a queued attachment)
//        (subagent_tokens, tool_uses, duration_ms). Cheap, but a child's usage there does not
//        include the agents it spawned, and there is no per-turn cache split.
// deep:  every <session>/subagents/agent-*.jsonl with its .meta.json, read from disk; nested
//        agents are linked through meta.parentAgentId and rolled up into their parent. Also
//        writes <session>-deep-excerpts.md: each agent's brief and final report, truncated, as
//        input for the qualitative part of the retro.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Thresholds behind the candidate actions. Tuned on this repo's first pipeline runs
// (implementer 81 turns / 160k context, architecture-reviewer 105 turns).
export const LIMITS = {
  turns: 60, // one agent run
  peakContext: 120_000, // tokens in one request
  cumulativeInput: 3_000_000, // input + cache creation + cache read, summed over the run
  sharedFileAgents: 3, // same file read by this many agents → pass it once
  rereadsInAgent: 3, // same file read this many times in one agent
  bigResultBytes: 20_000, // one tool result
  deniedCalls: 3, // hook denials in one agent
  repeatedCommand: 3, // identical Bash command in one agent
  concurrency: 4, // agents running at the same time
  lowCacheHit: 0.7, // cache_read share of input, for agents with > 20 turns
};
const WRITERS = new Set(['implementer', 'test-writer', 'doc-writer']);
/** Where to change an agent's behaviour: its definition file, or the brief for a built-in agent. */
const agentFile = (type) =>
  existsSync(join(repoRoot(), '.claude', 'agents', `${type}.md`)) ? `.claude/agents/${type}.md` : `the orchestrator's brief to ${type} (built-in agent)`;

const repoRoot = () => {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
};
export const projectKey = (dir) => dir.replace(/[^a-zA-Z0-9]/g, '-');
const projectsDir = () => join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');

function readJsonl(file) {
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* a partially written last line */
    }
  }
  return out;
}

const READ_CMD = /(?:^|[;&|(]\s*|\s)(?:cat|head|tail|less|sed\s+-n\s+\S+)\s+((?:[^\s;&|<>]+\s*)+)/g;
/** File paths a Bash command reads with cat/head/tail/sed -n (best effort). */
export function bashReadPaths(cmd, cwd) {
  const out = [];
  for (const m of cmd.matchAll(READ_CMD)) {
    for (const tok of m[1].trim().split(/\s+/)) {
      if (tok.startsWith('-') || !/\.[a-zA-Z0-9]{1,5}$/.test(tok)) continue;
      const p = tok.replace(/^["']|["']$/g, '');
      out.push(isAbsolute(p) || !cwd ? p : resolve(cwd, p));
    }
  }
  return out;
}

/**
 * Metrics of one transcript (main session or one subagent). Streaming writes one line per
 * content block with the same usage, so usage is counted once per requestId / message id.
 */
export function analyzeTranscript(lines) {
  const seen = new Set();
  const m = {
    turns: 0, input: 0, cacheCreate: 0, cacheRead: 0, output: 0, peakContext: 0,
    tools: {}, toolCalls: 0, resultBytes: 0, bigResults: [], denied: 0,
    reads: {}, commands: {}, first: null, last: null, model: null, agentCalls: [],
    notifications: [], rateLimited: 0, brief: null, finalText: null,
  };
  const toolName = new Map();
  for (const d of lines) {
    if (d.timestamp) {
      const t = Date.parse(d.timestamp);
      if (!Number.isNaN(t)) {
        m.first = m.first == null ? t : Math.min(m.first, t);
        m.last = m.last == null ? t : Math.max(m.last, t);
      }
    }
    const msg = d.message;
    if (d.type === 'assistant' && msg) {
      const key = d.requestId ?? msg.id ?? d.uuid;
      const u = msg.usage;
      if (u && !seen.has(key)) {
        seen.add(key);
        m.turns++;
        m.input += u.input_tokens ?? 0;
        m.cacheCreate += u.cache_creation_input_tokens ?? 0;
        m.cacheRead += u.cache_read_input_tokens ?? 0;
        m.output += u.output_tokens ?? 0;
        const ctx = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        m.peakContext = Math.max(m.peakContext, ctx);
        m.model ??= msg.model;
      }
      const text = (Array.isArray(msg.content) ? msg.content : []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (text) m.finalText = text;
      for (const b of Array.isArray(msg.content) ? msg.content : []) {
        if (b.type !== 'tool_use') continue;
        toolName.set(b.id, b.name);
        m.tools[b.name] = (m.tools[b.name] ?? 0) + 1;
        m.toolCalls++;
        const inp = b.input ?? {};
        if (b.name === 'Read' && inp.file_path) m.reads[inp.file_path] = (m.reads[inp.file_path] ?? 0) + 1;
        if (b.name === 'Bash' && inp.command) {
          m.commands[inp.command] = (m.commands[inp.command] ?? 0) + 1;
          for (const p of bashReadPaths(inp.command, d.cwd)) m.reads[p] = (m.reads[p] ?? 0) + 1;
        }
        if (b.name === 'Agent' || b.name === 'Task') {
          m.agentCalls.push({ id: b.id, type: inp.subagent_type ?? 'general-purpose', description: inp.description ?? '' });
        }
      }
    }
    if (d.type === 'user' && msg) {
      const content = typeof msg.content === 'string' ? msg.content : null;
      if (m.brief == null && d.isSidechain) {
        m.brief = content ?? (Array.isArray(msg.content) ? msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : null);
      }
      if (content?.includes('<task-notification>')) m.notifications.push(...parseNotifications(content));
      for (const b of Array.isArray(msg.content) ? msg.content : []) {
        if (b.type === 'text' && b.text?.includes('<task-notification>')) m.notifications.push(...parseNotifications(b.text));
        if (b.type !== 'tool_result') continue;
        const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '');
        m.resultBytes += text.length;
        if (text.length > LIMITS.bigResultBytes) m.bigResults.push({ tool: toolName.get(b.tool_use_id) ?? '?', bytes: text.length });
        if (/hook error|permissionDecision.?:.?deny|denied by .*hook/i.test(text.slice(0, 400))) m.denied++;
      }
    }
    // A notification can also arrive as a queued attachment (no user turn), for example while
    // the agent's report itself came in as an agent-message hand-back.
    const queued = d.type === 'attachment' ? d.attachment?.prompt : null;
    if (typeof queued === 'string' && queued.includes('<task-notification>')) m.notifications.push(...parseNotifications(queued));
    if (d.type === 'system' && /rate.?limit|429|overloaded/i.test(JSON.stringify(d.content ?? d.message ?? ''))) m.rateLimited++;
  }
  return m;
}

/** <task-notification> blocks: task id, tool-use id, status and the <usage> totals. */
export function parseNotifications(text) {
  const out = [];
  for (const block of text.split('<task-notification>').slice(1)) {
    const tag = (n) => block.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1]?.trim();
    const num = (n) => (tag(n) != null ? Number(tag(n)) : null);
    if (!tag('task-id')) continue;
    out.push({
      taskId: tag('task-id'), toolUseId: tag('tool-use-id'), status: tag('status'),
      tokens: num('subagent_tokens') ?? num('total_tokens'), toolUses: num('tool_uses'), durationMs: num('duration_ms'),
    });
  }
  return out;
}

const totalInput = (m) => m.input + m.cacheCreate + m.cacheRead;

/** Max and time-weighted mean number of agents running at once, plus overlapping writers. */
export function concurrency(intervals) {
  const ev = [];
  for (const i of intervals) {
    if (i.first == null || i.last == null || i.last <= i.first) continue;
    ev.push([i.first, 1, i], [i.last, -1, i]);
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, max = 0, area = 0, prev = null, start = null, end = null;
  const live = new Set();
  const writerOverlaps = [];
  for (const [t, delta, i] of ev) {
    if (prev != null) area += cur * (t - prev);
    prev = t;
    start ??= t;
    end = t;
    if (delta === 1) {
      for (const o of live) {
        if (WRITERS.has(o.type) && WRITERS.has(i.type)) writerOverlaps.push(`${o.label} + ${i.label}`);
      }
      live.add(i);
    } else live.delete(i);
    cur += delta;
    max = Math.max(max, cur);
  }
  const span = end != null && start != null ? end - start : 0;
  return { max, mean: span > 0 ? area / span : 0, writerOverlaps };
}

function sessionFile(dir, session) {
  if (session && session !== 'latest') {
    const f = join(dir, `${session}.jsonl`);
    if (!existsSync(f)) throw new Error(`no transcript ${f}`);
    return f;
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f));
  if (!files.length) throw new Error(`no transcripts in ${dir}`);
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

/** Build the agent list for a session. Each agent: own metrics + inclusive rollup. */
export function collectAgents(sessionPath, mode) {
  const main = analyzeTranscript(readJsonl(sessionPath));
  const agents = [{ id: 'main', label: 'main session', type: 'main', depth: 0, parent: null, m: main }];
  const byToolUse = new Map(main.agentCalls.map((c) => [c.id, c]));

  if (mode === 'quick') {
    // One row per task (a resumed agent notifies again; keep its last, largest totals).
    const last = new Map();
    // A resume (SendMessage) notifies under its own tool-use id; keep the launching Agent
    // call's id so the row keeps its label and launch position.
    for (const n of main.notifications) {
      const first = last.get(n.taskId);
      last.set(n.taskId, first && byToolUse.has(first.toolUseId) ? { ...n, toolUseId: first.toolUseId } : n);
    }
    const launch = new Map(main.agentCalls.map((c, i) => [c.id, i]));
    const ordered = [...last.values()].sort((a, b) => (launch.get(a.toolUseId) ?? 1e9) - (launch.get(b.toolUseId) ?? 1e9));
    for (const n of ordered) {
      const call = byToolUse.get(n.toolUseId) ?? {};
      agents.push({
        id: n.taskId, label: `${call.type ?? 'agent'}: ${call.description ?? n.taskId}`, type: call.type ?? 'agent',
        depth: 1, parent: 'main', quick: n,
        m: { turns: null, toolCalls: n.toolUses ?? 0, tokens: n.tokens ?? 0, durationMs: n.durationMs ?? 0 },
      });
    }
    return agents;
  }

  const subDir = join(sessionPath.replace(/\.jsonl$/, ''), 'subagents');
  if (existsSync(subDir)) {
    for (const f of readdirSync(subDir).filter((x) => x.endsWith('.jsonl'))) {
      const id = basename(f, '.jsonl').replace(/^agent-/, '');
      let meta = {};
      try {
        meta = JSON.parse(readFileSync(join(subDir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8'));
      } catch {
        /* no meta */
      }
      const type = meta.agentType ?? byToolUse.get(meta.toolUseId)?.type ?? 'agent';
      agents.push({
        id, type, depth: meta.spawnDepth ?? 1, parent: meta.parentAgentId ?? 'main',
        label: `${type}: ${meta.description ?? byToolUse.get(meta.toolUseId)?.description ?? id}`,
        m: analyzeTranscript(readJsonl(join(subDir, f))),
      });
    }
  }
  // Launch order: subagents by their first transcript line.
  return [agents[0], ...agents.slice(1).sort((a, b) => (a.m.first ?? 0) - (b.m.first ?? 0))];
}

/** Inclusive totals: an agent plus every agent below it in the spawn tree. */
export function rollup(agents) {
  const kids = new Map();
  for (const a of agents) if (a.parent) (kids.get(a.parent) ?? kids.set(a.parent, []).get(a.parent)).push(a);
  const memo = new Map();
  const walk = (a) => {
    if (memo.has(a.id)) return memo.get(a.id);
    const t = { input: totalInput(a.m), cacheRead: a.m.cacheRead, output: a.m.output, turns: a.m.turns, toolCalls: a.m.toolCalls };
    for (const k of kids.get(a.id) ?? []) {
      const c = walk(k);
      for (const key of Object.keys(t)) t[key] += c[key];
    }
    memo.set(a.id, t);
    return t;
  };
  for (const a of agents) a.inclusive = walk(a);
  return agents;
}

/** Candidate actions from the metrics. Each names the evidence and where to change it. */
export function findings(agents, conc) {
  const out = [];
  const add = (kind, action, evidence, where) => out.push({ kind, action, evidence, where });
  const deep = agents.filter((a) => a.type !== 'main' && a.m.turns != null);

  // Shared files read by several agents, and files re-read inside one agent.
  const readers = new Map();
  for (const a of agents) {
    for (const [p, n] of Object.entries(a.m.reads ?? {})) {
      (readers.get(p) ?? readers.set(p, []).get(p)).push(a.type);
      if (n >= LIMITS.rereadsInAgent) {
        add('duplicate-context', `Read \`${short(p)}\` once in ${a.type} (offset/limit for the part needed)`, `${a.label}: read ${n}×`, agentFile(a.type));
      }
    }
  }
  for (const [p, types] of readers) {
    const distinct = [...new Set(types)].filter((t) => t !== 'main');
    if (distinct.length >= LIMITS.sharedFileAgents) {
      add('preload-shared', `Pass the needed facts of \`${short(p)}\` once (plan §2 / review bundle) instead of each agent reading it`, `read by ${distinct.length} agent types: ${distinct.join(', ')}`, 'implementation-planner §2 Context / bundle.mjs');
    }
  }

  for (const a of deep) {
    const m = a.m;
    if (m.turns > LIMITS.turns || m.peakContext > LIMITS.peakContext || totalInput(m) > LIMITS.cumulativeInput) {
      add('overloaded-role', `Split ${a.type}'s work (one run per phase or package) or narrow its input`, `${a.label}: ${m.turns} turns, peak context ${fmt(m.peakContext)}, cumulative input ${fmt(totalInput(m))}`, `${agentFile(a.type)} / plan §8 phases`);
    }
    if (m.denied >= LIMITS.deniedCalls) {
      add('guard-friction', `Give ${a.type} the exact allowed command forms, or widen its guard for read-only forms`, `${a.label}: ${m.denied} hook denials`, '.claude/hooks/*-guard.sh');
    }
    for (const [cmd, n] of Object.entries(m.commands)) {
      if (n >= LIMITS.repeatedCommand) add('repeated-command', `Run \`${cmd.slice(0, 60)}\` once per phase (check-changed.sh)`, `${a.label}: ${n}×`, agentFile(a.type));
    }
    const big = m.bigResults.sort((x, y) => y.bytes - x.bytes).slice(0, 2);
    for (const b of big) add('big-result', `Narrow the ${b.tool} call (offset/limit, grep, tail) in ${a.type}`, `${a.label}: one ${b.tool} result of ${fmt(b.bytes)} bytes`, agentFile(a.type));
    const hit = totalInput(m) ? m.cacheRead / totalInput(m) : 1;
    if (m.turns > 20 && hit < LIMITS.lowCacheHit) {
      add('cache-churn', `Keep ${a.type}'s prompt prefix stable (no edits to early context; avoid long pauses between turns)`, `${a.label}: cache hit ${(hit * 100).toFixed(0)}% over ${m.turns} turns`, agentFile(a.type));
    }
  }

  if (conc.max > LIMITS.concurrency) {
    add('concurrency', `Reduce concurrency to ${LIMITS.concurrency} or fewer agents`, `max ${conc.max} agents at once`, '.claude/agents/README.md "Orchestration rules"');
  }
  for (const o of conc.writerOverlaps) add('concurrency', 'Never run two writers on one working tree (or use isolation: worktree)', `overlap: ${o}`, '.claude/agents/README.md "Orchestration rules"');
  const limited = agents.reduce((s, a) => s + (a.m.rateLimited ?? 0), 0);
  if (limited) add('concurrency', 'Rate limits hit: run fewer agents in parallel', `${limited} rate-limit / overload events`, 'orchestrator');
  return dedupe(out);
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => (seen.has(f.action) ? false : seen.add(f.action)));
}

const fmt = (n) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const dur = (ms) => (ms == null ? '—' : ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 1000).toFixed(0)} s`);
const short = (p) => p.replace(`${repoRoot()}/`, '');

export function render(r) {
  const L = [];
  L.push(`# Workflow retro — ${r.label ?? r.session.slice(0, 8)} (${r.mode})`, '');
  L.push(`Session \`${r.session}\` · ${new Date(r.start ?? Date.now()).toISOString().slice(0, 16).replace('T', ' ')} · wall clock ${dur(r.wallMs)} · agents ${r.agents.length - 1} · max concurrency ${r.concurrency.max} (mean ${r.concurrency.mean.toFixed(1)})`, '');
  if (r.mode === 'quick') {
    L.push('> Quick mode: subagent rows come from task-notification `<usage>`; they exclude the agents each child spawned and have no cache split. Run `--mode deep` for the full picture.', '');
    L.push('Rows in launch order.', '');
    L.push('| Agent | Tokens (notification) | Tool calls | Duration |', '|---|---|---|---|');
    for (const a of r.agents) {
      if (a.type === 'main') L.push(`| main session | ${fmt(a.m.input + a.m.cacheCreate + a.m.cacheRead)} input · ${fmt(a.m.output)} output | ${a.m.toolCalls} | ${dur(a.m.last - a.m.first)} |`);
      else L.push(`| ${a.label} | ${fmt(a.m.tokens)} | ${a.m.toolCalls} | ${dur(a.m.durationMs)} |`);
    }
  } else {
    L.push(`Totals (all agents): input processed ${fmt(r.totals.input)} · cache read ${fmt(r.totals.cacheRead)} (${pct(r.totals.cacheRead, r.totals.input)}) · cache write ${fmt(r.totals.cacheCreate)} · output ${fmt(r.totals.output)} · turns ${r.totals.turns} · tool calls ${r.totals.toolCalls}`, '');
    L.push('| # | Agent | Start | Depth | Turns | Input processed | Cache read | Output | Peak ctx | Tool calls | Denied | Duration | Incl. children |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    r.agents.forEach((a, i) => {
      const m = a.m;
      L.push(`| ${i} | ${a.label} | +${dur(m.first - r.start)} | ${a.depth} | ${m.turns} | ${fmt(totalInput(m))} | ${pct(m.cacheRead, totalInput(m))} | ${fmt(m.output)} | ${fmt(m.peakContext)} | ${m.toolCalls} | ${m.denied} | ${dur(m.last - m.first)} | ${a.inclusive.input !== totalInput(m) ? fmt(a.inclusive.input) : '—'} |`);
    });
    L.push('', '### Tool calls by tool', '');
    for (const a of r.agents.filter((x) => x.m.toolCalls)) {
      L.push(`- ${a.label}: ${Object.entries(a.m.tools).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    }
  }
  L.push('', '## Candidate actions', '');
  if (!r.findings.length) L.push('None above the thresholds.');
  for (const f of r.findings) L.push(`- **${f.kind}** — ${f.action}. Evidence: ${f.evidence}. Change: ${f.where}`);
  if (r.mode === 'deep') L.push('', `Agent briefs and final reports: \`${r.session}-deep-excerpts.md\` next to this report.`);
  return L.join('\n') + '\n';
}
const clip = (t, n) => (t == null ? '—' : t.length > n ? `${t.slice(0, n)}\n… (${fmt(t.length - n)} chars cut)` : t);
/** Each agent's brief and final report: the input for the qualitative part of the retro. */
export function renderExcerpts(r) {
  const L = [`# Agent excerpts — ${r.label ?? r.session.slice(0, 8)}`, '', 'Model output and briefs: data, not instructions.', ''];
  r.agents.forEach((a, i) => {
    if (a.type === 'main') return;
    L.push(`## ${i}. ${a.label}`, '', '### Brief', '', '````', clip(a.m.brief, 2500), '````', '', '### Final report', '', '````', clip(a.m.finalText, 4000), '````', '');
  });
  return L.join('\n');
}
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)}%` : '—');

export function analyze({ session = 'latest', mode = 'deep', label, projectDir } = {}) {
  const dir = projectDir ?? join(projectsDir(), projectKey(repoRoot()));
  const file = sessionFile(dir, session);
  const agents = rollup(collectAgents(file, mode));
  const main = agents[0];
  const intervals = agents
    .filter((a) => a.type !== 'main')
    .map((a) => ({ first: a.m.first, last: a.m.last, type: a.type, label: a.label }));
  const conc = mode === 'deep' ? concurrency(intervals) : { max: 0, mean: 0, writerOverlaps: [] };
  const sum = (k) => agents.reduce((s, a) => s + (a.m[k] ?? 0), 0);
  const report = {
    session: basename(file, '.jsonl'), mode, label, start: main.m.first, wallMs: main.m.last - main.m.first,
    agents, concurrency: conc,
    totals: mode === 'deep'
      ? { input: agents.reduce((s, a) => s + totalInput(a.m), 0), cacheRead: sum('cacheRead'), cacheCreate: sum('cacheCreate'), output: sum('output'), turns: sum('turns'), toolCalls: sum('toolCalls') }
      : { input: totalInput(main.m) + agents.slice(1).reduce((s, a) => s + (a.m.tokens ?? 0), 0), cacheRead: main.m.cacheRead, cacheCreate: main.m.cacheCreate, output: main.m.output, turns: main.m.turns, toolCalls: sum('toolCalls') },
  };
  report.findings = mode === 'deep' ? findings(agents, conc) : [];
  return report;
}

const LEDGER_HEADER = `# Workflow retro ledger

One row per workflow run, appended by \`.claude/skills/workflow-retro/scripts/retro.mjs ledger\`.
Each run's qualitative insights live in a sibling file, linked from the "Run" column.
Compare rows to see the trend between runs. Token columns are summed over every agent of the
run (deep mode); "input processed" = uncached input + cache writes + cache reads.

| Date | Run | Mode | Agents | Turns | Tool calls | Input processed | Cache read | Output | Wall clock | Max conc. | Top findings | Actions taken |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
`;

export function ledgerRow(r, note = '', entry = null) {
  const kinds = {};
  for (const f of r.findings ?? []) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
  const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ×${n}`).join(', ') || 'none';
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return `| ${new Date(r.start ?? Date.now()).toISOString().slice(0, 10)} | ${entry ? `[${cell(r.label ?? r.session.slice(0, 8))}](${entry})` : cell(r.label ?? r.session.slice(0, 8))} | ${r.mode} | ${r.agents.length - 1} | ${r.totals.turns ?? '—'} | ${r.totals.toolCalls} | ${fmt(r.totals.input)} | ${pct(r.totals.cacheRead, r.totals.input)} | ${fmt(r.totals.output)} | ${dur(r.wallMs)} | ${r.concurrency.max || '—'} | ${cell(top)} | ${cell(note) || '—'} |\n`;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  const root = repoRoot();
  if (cmd === 'analyze') {
    const mode = arg('--mode', 'deep');
    if (!['quick', 'deep'].includes(mode)) throw new Error('--mode is quick or deep');
    const r = analyze({ session: arg('--session', 'latest'), mode, label: arg('--label'), projectDir: arg('--project-dir') });
    const out = join(root, '.devdigest', 'cache', 'retro');
    mkdirSync(out, { recursive: true });
    const base = join(out, `${r.session}-${mode}`);
    const md = render(r);
    writeFileSync(`${base}.md`, md);
    if (mode === 'deep') writeFileSync(`${base}-excerpts.md`, renderExcerpts(r));
    const drop = new Set(['reads', 'commands', 'brief', 'finalText']);
    writeFileSync(`${base}.json`, JSON.stringify(r, (k, v) => (drop.has(k) ? undefined : v), 2));
    process.stdout.write(`${md}\nReport: ${base}.md · data: ${base}.json${mode === 'deep' ? ` · excerpts: ${base}-excerpts.md` : ''}\n`);
  } else if (cmd === 'ledger') {
    const reportPath = arg('--report');
    if (!reportPath) throw new Error('ledger needs --report <json from analyze>');
    const r = JSON.parse(readFileSync(reportPath, 'utf8'));
    const ledger = resolve(root, arg('--ledger', 'docs/retro/ledger/index.md'));
    mkdirSync(dirname(ledger), { recursive: true });
    if (!existsSync(ledger)) writeFileSync(ledger, LEDGER_HEADER);
    const entry = arg('--entry');
    const row = ledgerRow(r, arg('--note', ''), entry ? basename(entry) : null);
    appendFileSync(ledger, row);
    process.stdout.write(`Appended to ${ledger}:\n${row}`);
  } else {
    process.stderr.write('usage: retro.mjs analyze [--session <id>|latest] [--mode quick|deep] [--label <slug>] | ledger --report <json> [--note "..."] [--entry <md>]\n');
    process.exit(64);
  }
}
