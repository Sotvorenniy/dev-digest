import { pgTable, uuid, text, integer, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { agents } from './agents';
import { skills } from './skills';
import { repos } from './repos';

// ============================================================ Project context
// Attachment rows only: a doc's content is read from the clone at run time and
// never stored here.

export const agentContextDocs = pgTable(
  'agent_context_docs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull(),
    createdAt: now(),
  },
  (t) => ({
    uq: uniqueIndex('agent_context_docs_agent_repo_path_uq').on(t.agentId, t.repoId, t.path),
    repoIdx: index('agent_context_docs_repo_idx').on(t.repoId, t.path),
  }),
);

export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull(),
    createdAt: now(),
  },
  (t) => ({
    uq: uniqueIndex('skill_context_docs_skill_repo_path_uq').on(t.skillId, t.repoId, t.path),
    repoIdx: index('skill_context_docs_repo_idx').on(t.repoId, t.path),
  }),
);
