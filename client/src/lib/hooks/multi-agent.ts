/* hooks/multi-agent.ts — GET /pulls/:id/multi-agent?agents=a,b. Polls every 4 s
   while any column is still running. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { MultiAgentRun } from "../types";

export function multiAgentKey(prId: string, agentIds: string[]) {
  return ["multi-agent", prId, agentIds.join(",")] as const;
}

export function multiAgentRefetchInterval(data?: MultiAgentRun): number | false {
  return data?.columns.some((c) => c.status === "running") ? 4000 : false;
}

export function useMultiAgentRun(prId: string, agentIds: string[]) {
  return useQuery({
    queryKey: multiAgentKey(prId, agentIds),
    queryFn: () =>
      api.get<MultiAgentRun>(
        `/pulls/${prId}/multi-agent?agents=${agentIds.map(encodeURIComponent).join(",")}`,
      ),
    enabled: !!prId && agentIds.length > 0,
    refetchInterval: (q) => multiAgentRefetchInterval(q.state.data),
  });
}
