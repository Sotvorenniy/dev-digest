import type { CiAgent } from './ports.js';

/**
 * Agent manifest written to `.devdigest/agents/<slug>.yaml`. JSON is valid YAML 1.2,
 * so serializing as JSON keeps every prompt character (quotes, `:`, `#`, `---`,
 * newlines) intact without a YAML dependency. Fields are taken verbatim (AC7).
 */
export function renderManifest(agent: CiAgent, skillSlugs: string[]): string {
  return (
    JSON.stringify(
      {
        name: agent.name,
        provider: agent.provider,
        model: agent.model,
        system_prompt: agent.systemPrompt,
        skills: skillSlugs,
        strategy: agent.strategy,
        ci_fail_on: agent.ciFailOn,
      },
      null,
      2,
    ) + '\n'
  );
}
