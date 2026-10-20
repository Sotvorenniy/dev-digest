/* hooks/agent-performance.ts — the read-only Agent Performance dashboard.
   GET /agents/performance aggregates stored runs and findings; it never calls a model. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentPerf } from "../types";

export interface PerfQueryPeriod {
  from: string;
  to: string;
}

export function agentPerformanceKey(period: PerfQueryPeriod) {
  return ["agent-performance", period.from, period.to] as const;
}

export function agentPerformancePath(period: PerfQueryPeriod): string {
  return `/agents/performance?${new URLSearchParams({ from: period.from, to: period.to })}`;
}

/** No placeholderData: a new period must never show the previous period's numbers. */
export function useAgentPerformance(period: PerfQueryPeriod) {
  return useQuery({
    queryKey: agentPerformanceKey(period),
    queryFn: () => api.get<AgentPerf>(agentPerformancePath(period)),
    retry: false,
  });
}
