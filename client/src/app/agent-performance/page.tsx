import { AgentPerformanceView } from "./_components/AgentPerformanceView";

/* Route: /agent-performance (global Agent Performance dashboard). Thin route entry —
   the view, its children, styles, constants and helpers live under _components/AgentPerformanceView. */
export default function AgentPerformancePage() {
  return <AgentPerformanceView />;
}
