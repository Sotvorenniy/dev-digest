/* hooks/ci.ts — React Query hooks for Export-to-CI (SPEC-09).
   The installations list of one agent and the export mutation (files / open_pr). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CiExport, CiExportInputBody, CiInstallation } from "@devdigest/shared";

export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["ci-installations", agentId],
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci-installations`),
    enabled: !!agentId,
  });
}

/** `action: "files"` only generates the bundle; `"open_pr"` also opens the PR and records the installation. */
export function useExportCi(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CiExportInputBody) =>
      api.post<CiExport>(`/agents/${agentId}/export-ci`, body),
    onSuccess: (_data, body) => {
      if (body.action === "open_pr") {
        qc.invalidateQueries({ queryKey: ["ci-installations", agentId] });
      }
    },
  });
}
