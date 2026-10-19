/* hooks/agent-stats.ts — the read-only Stats tab of the agent editor.
   GET /agents/:id/stats aggregates stored runs and findings; it never calls a model. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentStats } from "../types";

export interface AgentStatsPeriod {
  from: string;
  to: string;
}

export function agentStatsKey(agentId: string, period: AgentStatsPeriod) {
  return ["agent-stats", agentId, period.from, period.to] as const;
}

export function agentStatsPath(agentId: string, period: AgentStatsPeriod): string {
  return `/agents/${encodeURIComponent(agentId)}/stats?${new URLSearchParams({ from: period.from, to: period.to })}`;
}

/** No placeholderData: a new period must never show the previous period's numbers. */
export function useAgentStats(agentId: string, period: AgentStatsPeriod) {
  return useQuery({
    queryKey: agentStatsKey(agentId, period),
    queryFn: () => api.get<AgentStats>(agentStatsPath(agentId, period)),
    retry: false,
  });
}
