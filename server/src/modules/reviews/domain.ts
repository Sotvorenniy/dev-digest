/**
 * Reviews-module domain rules (pure — no DB, no framework): multi-agent run
 * validation, cross-agent finding grouping and conflict building.
 */
import type { Conflict } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { countedReviewIds } from '../pulls/domain.js';

export const MAX_AGENT_IDS = 6;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Agent ids are UUIDs; anything else names no agent (404, never a Postgres error). */
export function isAgentIdShape(id: string): boolean {
  return UUID_RE.test(id);
}

/** 400 `invalid_run_request` for an empty list, a duplicate, or more than MAX_AGENT_IDS. */
export function assertAgentIdList(ids: readonly string[]): void {
  if (ids.length === 0) {
    throw new AppError('invalid_run_request', 'Provide at least one agent id', 400);
  }
  if (ids.length > MAX_AGENT_IDS) {
    throw new AppError('invalid_run_request', `At most ${MAX_AGENT_IDS} agents per run`, 400);
  }
  if (new Set(ids).size !== ids.length) {
    throw new AppError('invalid_run_request', 'Duplicate agent id', 400);
  }
}

export interface GroupableFinding {
  id: string;
  file: string;
  start_line: number;
  end_line: number;
  /** `agent:<id>`, or `review:<id>` for a review with no agent. */
  bucket: string;
}

/**
 * Group findings of different buckets that overlap (inclusive lines, same file).
 * Transitive (union-find). `group_key` is the smallest member id, so it does not
 * depend on input order. Every finding gets a key, singletons included.
 */
export function groupFindings(
  findings: readonly GroupableFinding[],
): Map<string, { group_key: string; member_ids: string[] }> {
  const parent = new Map<string, string>(findings.map((f) => [f.id, f.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };

  const byFile = new Map<string, GroupableFinding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file);
    if (list) list.push(f);
    else byFile.set(f.file, [f]);
  }
  for (const list of byFile.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.bucket === b.bucket) continue;
        if (a.start_line <= b.end_line && b.start_line <= a.end_line) {
          parent.set(find(a.id), find(b.id));
        }
      }
    }
  }

  const members = new Map<string, string[]>();
  for (const f of findings) {
    const root = find(f.id);
    const list = members.get(root);
    if (list) list.push(f.id);
    else members.set(root, [f.id]);
  }
  const out = new Map<string, { group_key: string; member_ids: string[] }>();
  for (const ids of members.values()) {
    const group_key = ids.reduce((min, id) => (id < min ? id : min));
    for (const id of ids) out.set(id, { group_key, member_ids: ids });
  }
  return out;
}

interface AttributableFinding {
  id: string;
  file: string;
  start_line: number;
  end_line: number;
}

interface AttributableReview<F extends AttributableFinding> {
  id: string;
  agent_id: string | null;
  agent_name?: string | null;
  pr_id: string;
  findings: F[];
}

export interface Attribution {
  agent_id: string | null;
  agent_name: string | null;
  group_key: string | null;
  agreed_by: { agent_id: string; agent_name: string | null; finding_id: string }[];
}

/**
 * Attach agent attribution, group key and `agreed_by` to every finding. Scope is
 * the newest review per agent (input newest first); older reviews get a null key
 * and no `agreed_by`. `agreed_by` never holds the finding's own agent.
 */
export function attributeFindings<F extends AttributableFinding, R extends AttributableReview<F>>(
  reviewsNewestFirst: R[],
): (Omit<R, 'findings'> & { findings: (F & Attribution)[] })[] {
  const counted = countedReviewIds(
    reviewsNewestFirst.map((r) => ({ id: r.id, prId: r.pr_id, agentId: r.agent_id })),
  );
  const bucketOf = (r: R) => (r.agent_id ? `agent:${r.agent_id}` : `review:${r.id}`);

  const groupable: GroupableFinding[] = [];
  const owner = new Map<string, R>();
  for (const r of reviewsNewestFirst) {
    if (!counted.has(r.id)) continue;
    for (const f of r.findings) {
      groupable.push({ id: f.id, file: f.file, start_line: f.start_line, end_line: f.end_line, bucket: bucketOf(r) });
      owner.set(f.id, r);
    }
  }
  const groups = groupFindings(groupable);

  return reviewsNewestFirst.map((r) => ({
    ...r,
    findings: r.findings.map((f) => {
      const g = groups.get(f.id);
      const agreed_by: Attribution['agreed_by'] = [];
      if (g && r.agent_id) {
        for (const mid of g.member_ids) {
          const o = owner.get(mid)!;
          if (!o.agent_id || o.agent_id === r.agent_id) continue;
          agreed_by.push({ agent_id: o.agent_id, agent_name: o.agent_name ?? null, finding_id: mid });
        }
      }
      return {
        ...f,
        agent_id: r.agent_id,
        agent_name: r.agent_name ?? null,
        group_key: g?.group_key ?? null,
        agreed_by,
      };
    }),
  }));
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

interface ConflictColumn {
  agent_id: string;
  agent_name: string;
  status: string;
  findings: {
    id: string;
    severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
    title: string;
    file: string;
    start_line: number;
    end_line: number;
    group_key: string | null;
  }[];
}

/** One entry per overlap group that at least one column flagged, sorted by file then line. */
export function buildConflicts(columns: ConflictColumn[]): Conflict[] {
  const keys = new Set<string>();
  for (const c of columns) for (const f of c.findings) if (f.group_key) keys.add(f.group_key);

  const out: Conflict[] = [];
  for (const key of keys) {
    let file = '';
    let line = Infinity;
    let end_line = -Infinity;
    let title: string | null = null;
    const takes: Conflict['takes'] = [];
    const severities = new Set<string>();
    let ignored = false;

    for (const c of columns) {
      const mine = c.findings.filter((f) => f.group_key === key);
      if (mine.length === 0) {
        if (c.status === 'done') {
          takes.push({ agent_id: c.agent_id, persona: c.agent_name, verdict: 'ignored', note: '' });
          ignored = true;
        }
        continue;
      }
      for (const f of mine) {
        file = f.file;
        line = Math.min(line, f.start_line);
        end_line = Math.max(end_line, f.end_line);
      }
      const top = mine.reduce((a, b) => ((SEVERITY_RANK[b.severity] ?? 0) > (SEVERITY_RANK[a.severity] ?? 0) ? b : a));
      title ??= mine[0]!.title;
      severities.add(top.severity);
      takes.push({ agent_id: c.agent_id, persona: c.agent_name, verdict: top.severity, note: top.title });
    }

    out.push({
      file,
      line,
      end_line,
      group_key: key,
      is_conflict: ignored || severities.size > 1,
      title: title ?? '',
      takes,
    });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
