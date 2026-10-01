/**
 * conventions — constants for the scan pipeline (sampling, batching,
 * verification pool size) and the fixed lint-config filenames / default
 * system prompt used to drive `scanConventionsBatch`.
 */

// --- Job kind (registered on JobRunner; enqueued from routes.ts/service.ts) --
export const CONVENTION_SCAN_JOB_KIND = 'conventions-scan';
/**
 * JobRunner's own default (120s / 2 retries) fits a single-call job like
 * resync; this pipeline makes several SEQUENTIAL real LLM calls (batched
 * extraction waves, then merge, then verify) and 120s isn't enough headroom
 * even for a small sample set — confirmed against a real OpenRouter model in
 * manual testing. Give it a longer budget, and 0 retries: `executeScan`
 * already resolves cleanly on every internal failure (see its own try/catch),
 * so JobRunner retrying here would only re-run the whole multi-call pipeline
 * from scratch — 2-3x the LLM cost for a job that already reports its own
 * failure — with no correctness benefit.
 */
export const CONVENTION_SCAN_JOB_TIMEOUT_MS = 480_000;
export const CONVENTION_SCAN_JOB_RETRIES = 0;

// --- Sample selection --------------------------------------------------------
/** Cap on SOURCE files sampled: top-N pulled via `repoIntel.getConventionSamples`. */
export const RANK_SAMPLE_COUNT = 12;
/** Max config files (eslint/prettier/tsconfig/editorconfig/biome) added on top of the source samples. */
export const CONFIG_SAMPLE_MAX_FILES = 6;
/** Config file content is truncated to this many chars before it is sampled. */
export const CONFIG_SAMPLE_MAX_CHARS = 8000;

// --- Batched extraction -------------------------------------------------------
/** Sample files per `scanConventionsBatch` call. */
export const EXTRACTION_BATCH_SIZE = 10;
/** Batches run concurrently (in waves) during extraction. */
export const EXTRACTION_CONCURRENCY = 3;

// --- Verification --------------------------------------------------------------
/** Held-out sample files (not used as any merged candidate's own evidence) checked against. */
export const VERIFICATION_HELD_OUT_POOL_SIZE = 15;

/**
 * Lint/formatter config filenames `detectLintConfig` checks for, at the repo
 * root and one level down. Presence of any of these builds the trusted
 * `lintConfigNote` fed into `assembleConventionScanPrompt`.
 */
export const LINT_CONFIG_FILENAMES = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.editorconfig',
  'biome.json',
] as const;

/**
 * Root-level config files that are ALSO fed to the model as sample files
 * (so conventions declared in config, e.g. strict tsconfig flags or prettier
 * style, can be cited and grounded like any other file).
 */
export const CONFIG_SAMPLE_FILENAMES = [
  ...LINT_CONFIG_FILENAMES,
  'biome.jsonc',
  'tsconfig.json',
  'tsconfig.base.json',
] as const;

/**
 * Default system prompt for `scanConventionsBatch`. Instructs the model to
 * find repo-WIDE house rules (not one-off, single-file patterns) and to cite
 * real file:line evidence verbatim — the grounding gate
 * (`groundConventionCandidates`) drops anything that doesn't actually appear
 * in the cited file, so a paraphrased/invented snippet is wasted work, not a
 * successful candidate.
 */
export const DEFAULT_CONVENTION_SCAN_SYSTEM_PROMPT =
  'You are analyzing a sample of files from a single code repository to detect its ' +
  'repo-wide code-style CONVENTIONS — house rules the team consistently follows, not ' +
  'one-off patterns that happen to appear in a single file. For each convention you find, ' +
  'report: a clear one-sentence "rule" description; the exact file path (evidence_path) ' +
  'and, when the pattern is localized, a start/end line range (evidence_start_line / ' +
  'evidence_end_line, 1-based, inclusive) that best illustrates it; a short snippet ' +
  '(evidence_snippet) copied EXACTLY VERBATIM from that file\'s content at those lines — ' +
  'never paraphrase or invent the snippet; a short lowercase "category" ' +
  '(one of: naming, structure, error-handling, typing, testing, imports, api, style, other); ' +
  'and your own confidence (0-1) that this is a ' +
  'genuine, deliberate repo-wide convention rather than incidental to one file. Only report ' +
  'conventions you can observe directly in the given files — never conventions you assume ' +
  'from general best practice. Prefer conventions that require judgment to recognize ' +
  '(naming semantics, error-handling idioms, structural/layering patterns, API usage ' +
  'conventions) over anything a linter or formatter would already enforce mechanically.';
