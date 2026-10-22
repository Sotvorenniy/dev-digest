/* hooks/eval.ts — React Query hooks for the per-agent eval pipeline (SPEC-06).
   Cases, set runs (polled while running) and one run's detail for Compare. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { isNewestRunning } from "../eval-metrics";
import type {
  EvalAgentDashboard,
  EvalCase,
  EvalCaseDraft,
  EvalCaseFields,
  EvalCaseResult,
  EvalSetRun,
  EvalSetRunDetail,
  EvalWorkspaceDashboard,
} from "@devdigest/shared";

export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCase[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

/** Save a decided finding as an eval case. `agentId` is sent only when the review has no
   agent of its own (the picker path); `fields` are the warmed-up values from the modal. */
export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      agentId,
      fields,
    }: {
      findingId: string;
      agentId?: string;
      fields?: EvalCaseFields;
    }) =>
      api.post<EvalCase>(
        `/findings/${findingId}/eval-case`,
        agentId || fields ? { agent_id: agentId, case: fields } : undefined,
      ),
    onSuccess: (evalCase) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", evalCase.owner_id] });
    },
  });
}

/** Prefilled, unsaved case for the modal. Writes nothing. */
export function useEvalCaseDraft() {
  return useMutation({
    mutationFn: ({ findingId, agentId }: { findingId: string; agentId?: string }) =>
      api.post<EvalCaseDraft>(
        `/findings/${findingId}/eval-case/draft`,
        agentId ? { agent_id: agentId } : undefined,
      ),
  });
}

/** Run one unsaved case with the agent's current prompt. Writes nothing. */
export function useRunEvalCaseDraft(agentId: string) {
  return useMutation({
    mutationFn: (fields: EvalCaseFields) =>
      api.post<EvalCaseResult>(`/agents/${agentId}/eval-cases/run`, fields),
  });
}

export function useDeleteEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<void>(`/eval-cases/${caseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    },
  });
}

/** Run history, newest first. Polls while the latest run is still running. */
export function useEvalRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-runs", agentId],
    queryFn: () => api.get<EvalSetRun[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
    refetchInterval: (query) => (isNewestRunning(query.state.data) ? 4000 : false),
  });
}

export function useStartEvalRun(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalSetRun>(`/agents/${agentId}/eval-runs`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** Workspace Eval Dashboard (SPEC-07): agents with cases + the newest runs. */
export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalWorkspaceDashboard>("/eval/dashboard"),
    refetchOnWindowFocus: true,
  });
}

/** One agent's dashboard. Polls while the newest run is running; no retry so a 404 shows at once. */
export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-dashboard", agentId],
    queryFn: () => api.get<EvalAgentDashboard>(`/agents/${agentId}/eval-dashboard`),
    enabled: !!agentId,
    retry: false,
    refetchInterval: (query) => (isNewestRunning(query.state.data?.runs) ? 4000 : false),
  });
}

/** One run with its per-case results and system prompt (Compare dialog). */
export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-run", runId],
    queryFn: () => api.get<EvalSetRunDetail>(`/eval-runs/${runId}`),
    enabled: !!runId,
  });
}
