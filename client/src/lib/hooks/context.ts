/* hooks/context.ts — React Query hooks for Project Context: the repo's doc list,
   a single doc preview, and per-agent / per-skill attachments. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ProjectContextList,
  ProjectContextFile,
  ContextAttachments,
  ContextAttachmentsSaved,
} from "../types";

export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<ProjectContextList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useContextDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-doc", repoId, path],
    queryFn: () =>
      api.get<ProjectContextFile>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
    retry: false,
  });
}

type OwnerKind = "agents" | "skills";

function useAttachments(kind: OwnerKind, key: string, ownerId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: [key, ownerId, repoId],
    queryFn: () =>
      api.get<ContextAttachments>(`/${kind}/${ownerId}/context?repo_id=${encodeURIComponent(repoId ?? "")}`),
    enabled: !!ownerId && !!repoId,
  });
}

function useSetAttachments(kind: OwnerKind, key: string, ownerId: string, repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.put<ContextAttachmentsSaved>(`/${kind}/${ownerId}/context`, { repo_id: repoId, paths }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [key, ownerId, repoId] });
      qc.invalidateQueries({ queryKey: ["context", repoId] });
    },
  });
}

/** An agent's attached context docs for one repo (Agent editor's Context tab). */
export function useAgentContext(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useAttachments("agents", "agent-context", agentId, repoId);
}

export function useSetAgentContext(agentId: string, repoId: string) {
  return useSetAttachments("agents", "agent-context", agentId, repoId);
}

/** A skill's attached context docs for one repo (Skill editor's Context tab). */
export function useSkillContext(skillId: string | null | undefined, repoId: string | null | undefined) {
  return useAttachments("skills", "skill-context", skillId, repoId);
}

export function useSetSkillContext(skillId: string, repoId: string) {
  return useSetAttachments("skills", "skill-context", skillId, repoId);
}
