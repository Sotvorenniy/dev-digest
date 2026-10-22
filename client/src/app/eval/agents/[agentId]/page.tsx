import { AgentEvalView } from "./_components/AgentEvalView";

/* Route: /eval/agents/[agentId] (per-agent eval dashboard, SPEC-07). Thin route entry —
   the view, its children, styles and helpers live under _components/AgentEvalView. */
export default function AgentEvalPage() {
  return <AgentEvalView />;
}
