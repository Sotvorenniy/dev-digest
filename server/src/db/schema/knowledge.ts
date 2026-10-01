import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, integer, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

export const conventions = pgTable('conventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  rule: text('rule').notNull(),
  evidencePath: text('evidence_path'),
  evidenceSnippet: text('evidence_snippet'),
  evidenceStartLine: integer('evidence_start_line'),
  evidenceEndLine: integer('evidence_end_line'),
  confidence: doublePrecision('confidence'),
  category: text('category'),
  status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
    .notNull()
    .default('pending'),
});

/**
 * Per-repo convention-scan status, 1:1 with repos (mirrors repoIndexState).
 * Drives the Conventions page's "Detected from N sample files · last scan
 * Xh ago" line and the Run Scan / Re-scan polling — a single cheap row read
 * instead of aggregating over `conventions`.
 */
export const conventionScans = pgTable('convention_scans', {
  repoId: uuid('repo_id')
    .primaryKey()
    .references(() => repos.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull(),
  sampledFileCount: integer('sampled_file_count').notNull().default(0),
  candidateCount: integer('candidate_count').notNull().default(0),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
