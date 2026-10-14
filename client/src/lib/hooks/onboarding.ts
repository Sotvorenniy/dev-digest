/* hooks/onboarding.ts — React Query hooks for the per-repo Onboarding Tour.
   Mirrors hooks/conventions.ts: a conditional refetchInterval while a job is
   in flight, and a mutation that flips the cached state to 'generating'. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useResyncRepoIntel } from "./repo-intel";
import type { OnboardingGenerateResponse, OnboardingState } from "@devdigest/shared";

/** 24 req/min — well under the API's 120/min global limit. */
export const ONBOARDING_POLL_MS = 2_500;
/** How long a triggered resync keeps the page polling for `index.usable`. */
export const RESYNC_POLL_MAX_MS = 120_000;

export const onboardingQueryKey = (repoId: string | null | undefined) => ["onboarding", repoId] as const;

export interface OnboardingPollOptions {
  /** Epoch ms of the last user-triggered resync, if any. */
  resyncPendingSince?: number | null;
  /** Injectable clock for tests. */
  now?: number;
}

/** Pure poll-interval rule: poll while generating, and (bounded) while a
    resync is awaiting an index that is not usable yet. */
export function onboardingRefetchInterval(
  state: OnboardingState | undefined,
  opts: OnboardingPollOptions = {},
): number | false {
  if (!state) return false;
  if (state.status === "generating") return ONBOARDING_POLL_MS;
  const since = opts.resyncPendingSince;
  if (since != null && state.status === "none" && !state.index.usable) {
    const now = opts.now ?? Date.now();
    if (now - since < RESYNC_POLL_MAX_MS) return ONBOARDING_POLL_MS;
  }
  return false;
}

/** GET /repos/:id/onboarding → OnboardingState. */
export function useOnboarding(repoId: string | null | undefined, opts: { resyncPendingSince?: number | null } = {}) {
  const { resyncPendingSince } = opts;
  return useQuery({
    queryKey: onboardingQueryKey(repoId),
    queryFn: () => api.get<OnboardingState>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (query) => onboardingRefetchInterval(query.state.data, { resyncPendingSince }),
  });
}

/** POST /repos/:id/onboarding/generate → 202 { status:'generating', job_id }. */
export function useGenerateOnboarding(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingGenerateResponse>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: (res) => {
      const previous = qc.getQueryData<OnboardingState>(onboardingQueryKey(repoId));
      if (previous) {
        qc.setQueryData<OnboardingState>(onboardingQueryKey(repoId), {
          ...previous,
          status: "generating",
          job_id: res.job_id,
        });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: onboardingQueryKey(repoId) });
    },
  });
}

/** Resync (reused repo-intel hook) that also refreshes the onboarding state so
    `index.usable` is re-read. The view records `resyncPendingSince` itself. */
export function useResyncForOnboarding(repoId: string | null | undefined) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  return {
    ...resync,
    mutate: (_vars?: void, options?: Parameters<typeof resync.mutate>[1]) =>
      resync.mutate(undefined, {
        ...options,
        onSuccess: (...args) => {
          qc.invalidateQueries({ queryKey: onboardingQueryKey(repoId) });
          options?.onSuccess?.(...args);
        },
      }),
  };
}
