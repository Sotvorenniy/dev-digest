import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Db } from '../../src/db/client.js';
import * as t from '../../src/db/schema.js';

/**
 * Convention-detection pipeline fixture: a small on-disk clone with two files
 * that carry a deliberately DIFFERENT, low-similarity "convention" each (so
 * `clusterCandidatesByRuleSimilarity` puts them in separate clusters and the
 * merge pass's LLM call actually runs), plus a third file used only as
 * verification held-out content. Content and line numbers here are
 * load-bearing — the fixture LLM responses in each test cite these exact
 * paths/snippets/lines, and `groundConventionCandidates` checks the citation
 * is real.
 */
export const CONVENTIONS_FIXTURE_FILES: Record<string, string> = {
  'src/a.ts': 'export async function fetchThing() {\n  return await doWork();\n}\n',
  'src/b.ts': "export function doStuff() {\n  console.log('side effect');\n}\n",
  'src/c.ts': 'export const VERSION = 1;\n',
};

export async function writeConventionsFixtureClone(): Promise<{
  clonePath: string;
  cleanup: () => Promise<void>;
}> {
  const clonePath = await mkdtemp(join(tmpdir(), 'devdigest-conventions-'));
  for (const [path, content] of Object.entries(CONVENTIONS_FIXTURE_FILES)) {
    const full = join(clonePath, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return {
    clonePath,
    cleanup: () => rm(clonePath, { recursive: true, force: true }),
  };
}

/**
 * `MockLLMOptions.structuredBySchema` fixture for a full scan pipeline run
 * over `CONVENTIONS_FIXTURE_FILES`: one `ConventionScanBatch` call returns two
 * low-similarity candidates (distinct clusters → the `MergeConventions` LLM
 * call actually runs, not the <=1-cluster short-circuit), and
 * `VerifyConventions` confirms both as `repo_wide` so both clear the
 * confidence floor.
 */
export function buildTwoCandidateLlmFixture(): Record<string, unknown> {
  return {
    ConventionScanBatch: {
      candidates: [
        {
          rule: 'I/O functions are always async and use await',
          evidence_path: 'src/a.ts',
          evidence_snippet: 'export async function fetchThing() {',
          evidence_start_line: 1,
          evidence_end_line: 1,
          confidence: 0.8,
          category: 'error-handling',
        },
        {
          rule: 'Side-effecting functions log via console.log',
          evidence_path: 'src/b.ts',
          evidence_snippet: 'export function doStuff() {',
          evidence_start_line: 1,
          evidence_end_line: 1,
          confidence: 0.75,
          category: 'style',
        },
      ],
    },
    MergeConventions: {
      merged: [
        { rule: 'I/O functions are always async and use await', absorbed_cluster_ids: ['cluster-0'] },
        { rule: 'Side-effecting functions log via console.log', absorbed_cluster_ids: ['cluster-1'] },
      ],
    },
    VerifyConventions: {
      results: [
        {
          candidate_id: 'merged-0',
          confirmed_in_files: ['src/c.ts'],
          contradicted_in_files: [],
          verdict: 'repo_wide',
        },
        {
          candidate_id: 'merged-1',
          confirmed_in_files: ['src/c.ts'],
          contradicted_in_files: [],
          verdict: 'repo_wide',
        },
      ],
    },
  };
}

let repoSeq = 0;

/** Insert a repo row scoped to `workspaceId` with `clonePath` set (or left null). */
export async function insertConventionsRepo(
  db: Db,
  workspaceId: string,
  clonePath: string | null,
): Promise<string> {
  const name = `conventions-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
    .returning();
  return repo!.id;
}
