// Binding, user-approved tool descriptions. Do not reword; any change needs
// the user's approval. test/tools.test.ts pins these as literals.
export const TOOL_DESCRIPTIONS = {
  list_agents:
    'List configured dev-digest reviewer agents (id, name, enabled, model, short description). Use an id or name with run_agent_on_pr; omit agent there to run all enabled agents.',
  run_agent_on_pr:
    'Run a dev-digest review on a pull request and wait up to 120s. Returns verdict, score and top findings per agent. On timeout returns run_ids: call get_findings later instead of re-running. Rate-limited 10/min.',
  get_findings:
    'Get findings of a dev-digest review: one run (run_id) or, by default, the latest review per agent on the PR. Sorted by severity, paged; filter with min_severity. Use after run_agent_on_pr.',
  get_conventions:
    'Get coding conventions dev-digest extracted for an imported repo (rule, evidence file:lines, confidence). Defaults to accepted rules; status=pending shows unreviewed candidates. Paged.',
  get_blast_radius:
    "Show what a PR's changes can break: changed symbols, their callers (file:line) and the HTTP endpoints and crons that depend on them. Reads the prebuilt repo index. Use before reviewing a PR; pass path to narrow.",
} as const;

export type ToolName = keyof typeof TOOL_DESCRIPTIONS;

/** Allowed description length range per tool (get_blast_radius is below the general floor). */
export const DESCRIPTION_RANGE: Record<ToolName, [number, number]> = {
  list_agents: [150, 300],
  run_agent_on_pr: [150, 300],
  get_findings: [150, 300],
  get_conventions: [150, 300],
  get_blast_radius: [100, 300],
};
