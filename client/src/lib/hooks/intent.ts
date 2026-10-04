/* hooks/intent.ts — derived PR intent. GET /pulls/:id/intent only reads (404 =
   never derived → `null`); POST derives on demand (one cheap LLM call). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrIntentRecord } from "../types";

export function useIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["intent", prId],
    queryFn: async (): Promise<PrIntentRecord | null> => {
      try {
        return await api.get<PrIntentRecord>(`/pulls/${prId}/intent`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!prId,
    retry: false,
  });
}

export function useDeriveIntent(prId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) =>
      api.post<PrIntentRecord>(`/pulls/${prId}/intent`, { force }),
    onSuccess: (data) => qc.setQueryData(["intent", prId], data),
  });
}
