/* hooks/brief.ts — PR why + risk brief. GET /pulls/:id/brief only reads (404 =
   never generated → `null`); POST generates (or regenerates) with one LLM call. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrBrief } from "../types";

export const briefQueryKey = (prId: string | null | undefined) => ["brief", prId] as const;

export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefQueryKey(prId),
    queryFn: async (): Promise<PrBrief | null> => {
      try {
        return await api.get<PrBrief>(`/pulls/${prId}/brief`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!prId,
    retry: false,
  });
}

export function useGenerateBrief(prId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBrief>(`/pulls/${prId}/brief`),
    onSuccess: (data) => qc.setQueryData(briefQueryKey(prId), data),
  });
}
