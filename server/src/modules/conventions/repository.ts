import { and, desc, eq, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  ConventionCandidate,
  ConventionCandidateStatus,
  ConventionScanState,
  ConventionScanStatus,
} from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import type {
  ConventionsRepositoryPort,
  ConventionScanStatePatch,
  NewConventionRow,
  UpdateConventionCandidatePatch,
} from './ports.js';

/**
 * conventions data-access. Owns `conventions` + `convention_scans`.
 * Workspace-scoped throughout. Infrastructure: the only place a raw
 * `ConventionRow`/`ConventionScanRow` is seen — every public method returns
 * the mapped domain type, never the row (same idiom as SkillsRepository).
 */

/**
 * `evidencePath`/`evidenceSnippet`/`confidence`/`repoId` are nullable at the
 * schema level (the table predates this feature), but every row this module
 * writes always sets them — the `?? ''`/`?? 0` fallbacks only guard against a
 * theoretical foreign row, never our own inserts.
 */
function toConventionCandidateDomain(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId ?? '',
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_start_line: row.evidenceStartLine,
    evidence_end_line: row.evidenceEndLine,
    confidence: row.confidence ?? 0,
    category: row.category ?? null,
    status: row.status as ConventionCandidateStatus,
  };
}

/**
 * ALWAYS works — mirrors `RepoIntelService.getIndexState`'s degraded-but-valid
 * pattern. No persisted row (scan never run) synthesises a `never_run` state
 * instead of the caller having to special-case `undefined`.
 */
function toConventionScanStateDomain(
  row: ConventionScanRow | undefined,
  repoId: string,
): ConventionScanState {
  if (!row) {
    return {
      repo_id: repoId,
      status: 'never_run',
      sampled_file_count: 0,
      candidate_count: 0,
    };
  }
  return {
    repo_id: repoId,
    status: row.status as ConventionScanStatus,
    sampled_file_count: row.sampledFileCount,
    candidate_count: row.candidateCount,
    error: row.error,
    started_at: row.startedAt ? row.startedAt.toISOString() : null,
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

export class ConventionsRepository implements ConventionsRepositoryPort {
  constructor(private db: Db) {}

  async listVisible(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'rejected'),
        ),
      )
      .orderBy(desc(t.conventions.confidence));
    return rows.map(toConventionCandidateDomain);
  }

  async getScanState(repoId: string): Promise<ConventionScanState> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId));
    return toConventionScanStateDomain(row, repoId);
  }

  /**
   * Insert-or-merge the repo's one `convention_scans` row. Reads the existing
   * row first and merges `patch` over it (rather than a partial SQL upsert)
   * so a caller can patch just `{status: 'running', startedAt}` without
   * clobbering `sampledFileCount`/`candidateCount` from a prior run.
   */
  async upsertScanState(repoId: string, patch: ConventionScanStatePatch): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId));

    const now = new Date();
    const merged = {
      repoId,
      status: patch.status,
      sampledFileCount: patch.sampledFileCount ?? existing?.sampledFileCount ?? 0,
      candidateCount: patch.candidateCount ?? existing?.candidateCount ?? 0,
      error: patch.error !== undefined ? patch.error : (existing?.error ?? null),
      startedAt: patch.startedAt ?? existing?.startedAt ?? null,
      finishedAt: patch.finishedAt !== undefined ? patch.finishedAt : (existing?.finishedAt ?? null),
      updatedAt: now,
    };

    await this.db
      .insert(t.conventionScans)
      .values(merged)
      .onConflictDoUpdate({
        target: t.conventionScans.repoId,
        set: {
          status: merged.status,
          sampledFileCount: merged.sampledFileCount,
          candidateCount: merged.candidateCount,
          error: merged.error,
          startedAt: merged.startedAt,
          finishedAt: merged.finishedAt,
          updatedAt: merged.updatedAt,
        },
      });
  }

  /**
   * Rescan semantics (checklist 48 / plan decision): delete ONLY
   * `status: 'pending'` rows for the repo, then bulk-insert the fresh ones —
   * `accepted`/`rejected` rows are never touched. Transactional so a crash
   * mid-replace can't leave the repo candidate-less.
   */
  async replacePendingCandidates(
    workspaceId: string,
    repoId: string,
    rows: NewConventionRow[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (rows.length > 0) {
        await tx.insert(t.conventions).values(rows);
      }
    });
  }

  async updateCandidate(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: UpdateConventionCandidatePatch,
  ): Promise<ConventionCandidate | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.evidence_snippet !== undefined ? { evidenceSnippet: patch.evidence_snippet } : {}),
      })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.id, id),
        ),
      )
      .returning();
    return row ? toConventionCandidateDomain(row) : undefined;
  }

  async getAcceptedWithFiles(workspaceId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ evidencePath: t.conventions.evidencePath })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      );
    const paths = rows.map((r) => r.evidencePath).filter((p): p is string => Boolean(p));
    return [...new Set(paths)];
  }

  async getRepoClonePath(repoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row?.clonePath ?? null;
  }
}
