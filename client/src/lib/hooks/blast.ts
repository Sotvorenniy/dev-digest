/* hooks/blast.ts — the precomputed blast radius of a PR.
   GET /pulls/:id/blast only reads the repo index (no model call, no recompute). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "../types";

export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
    retry: false,
  });
}
