/* hooks/conventions.ts — React Query hooks for the Conventions scan → review →
   Create-skill flow (Skills Lab). Mirrors hooks/reviews.ts's active-run polling
   shape (usePrActiveRuns) for the scan status, and hooks/skills.ts's mutation
   shape for the accept/reject/edit actions — with a full optimistic-update
   round trip so those feel instant, not spinner-then-update. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionCandidateStatus, ConventionScanState, Skill } from "@devdigest/shared";

export interface ConventionsResponse {
  candidates: ConventionCandidate[];
  scan: ConventionScanState;
}

/** Query key for a repo's conventions (candidates + scan state) — exported so
    components/tests can reference it without re-deriving the shape. */
export const conventionsQueryKey = (repoId: string | null | undefined) => ["conventions", repoId] as const;

/** GET /repos/:id/conventions → { candidates, scan }.
    Polls while a scan is in flight (queued/running), same shape as
    usePrActiveRuns's refetchInterval callback, so it self-clears on completion. */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionsQueryKey(repoId),
    queryFn: () => api.get<ConventionsResponse>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    refetchInterval: (query) => {
      const status = query.state.data?.scan.status;
      return status === "queued" || status === "running" ? 2500 : false;
    },
  });
}

/** POST /repos/:id/conventions/scan → 202 { status:'accepted', jobId? }.
    Optimistically flips the cached scan status to 'queued' for instant
    feedback (Run Scan/Re-scan disables + relabels immediately), then lets the
    poll in useConventions take over once the first real GET lands. */
export function useRunConventionScan(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ status: string; jobId?: string }>(`/repos/${repoId}/conventions/scan`),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: conventionsQueryKey(repoId) });
      const previous = qc.getQueryData<ConventionsResponse>(conventionsQueryKey(repoId));
      if (previous) {
        qc.setQueryData<ConventionsResponse>(conventionsQueryKey(repoId), {
          ...previous,
          scan: { ...previous.scan, status: "queued" },
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(conventionsQueryKey(repoId), ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: conventionsQueryKey(repoId) });
    },
  });
}

export interface SetConventionCandidateStatusInput {
  id: string;
  status: ConventionCandidateStatus;
}

/** PATCH /repos/:id/conventions/:candidateId { status } — Accept/Reject.
    Optimistic: a candidate set to 'rejected' is dropped from the cached list
    immediately (the server excludes rejected rows from the GET response, so
    this is what the next real fetch will show anyway); any other status is
    updated in place. Rolls back on error, always re-syncs on settle. */
export function useSetConventionCandidateStatus(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: SetConventionCandidateStatusInput) =>
      api.patch<ConventionCandidate>(`/repos/${repoId}/conventions/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: conventionsQueryKey(repoId) });
      const previous = qc.getQueryData<ConventionsResponse>(conventionsQueryKey(repoId));
      if (previous) {
        const candidates =
          status === "rejected"
            ? previous.candidates.filter((c) => c.id !== id)
            : previous.candidates.map((c) => (c.id === id ? { ...c, status } : c));
        qc.setQueryData<ConventionsResponse>(conventionsQueryKey(repoId), { ...previous, candidates });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(conventionsQueryKey(repoId), ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: conventionsQueryKey(repoId) });
    },
  });
}

export interface EditConventionCandidateInput {
  id: string;
  rule?: string;
  evidence_snippet?: string;
}

/** PATCH /repos/:id/conventions/:candidateId { rule?, evidence_snippet? } —
    inline Edit/Save. Same optimistic round trip as the status mutation. */
export function useEditConventionCandidate(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: EditConventionCandidateInput) =>
      api.patch<ConventionCandidate>(`/repos/${repoId}/conventions/${id}`, patch),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: conventionsQueryKey(repoId) });
      const previous = qc.getQueryData<ConventionsResponse>(conventionsQueryKey(repoId));
      if (previous) {
        qc.setQueryData<ConventionsResponse>(conventionsQueryKey(repoId), {
          ...previous,
          candidates: previous.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(conventionsQueryKey(repoId), ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: conventionsQueryKey(repoId) });
    },
  });
}

export interface CreateSkillFromConventionsInput {
  name: string;
  description?: string;
  type?: string;
  enabled?: boolean;
  body: string;
  /** Optionally attach the new skill to this agent. */
  agent_id?: string;
}

/** POST /repos/:id/conventions/skill → 201 Skill. Invalidates the exact
    ["skills"] query key useSkills() reads, so the new skill shows up on
    /skills with no further action needed there. */
export function useCreateSkillFromConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillFromConventionsInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
