"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { SkillBodyEditor } from "@/components/skill-body-editor/SkillBodyEditor";
import { useAgents } from "@/lib/hooks/agents";
import { useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { DEFAULT_SKILL_TYPE, MODAL_WIDTH, SKILL_TYPES } from "./constants";
import { buildDefaultSkillBody, buildDefaultSkillName } from "./helpers";
import { s } from "./styles";

/** "Create skill from conventions" modal — merges the accepted candidates into
 *  one new Skill. Every field is prefilled from the candidates but fully
 *  editable before Create; nothing is persisted on Cancel. */
export function CreateSkillModal({
  repoId,
  repoName,
  acceptedCandidates,
  onClose,
}: {
  repoId: string;
  repoName: string;
  acceptedCandidates: ConventionCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkillFromConventions(repoId);
  const { data: agents } = useAgents();

  const banner = t("createSkillModal.banner", { count: acceptedCandidates.length, repo: repoName });
  const [name, setName] = React.useState(() => buildDefaultSkillName());
  const [description, setDescription] = React.useState(banner);
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [agentId, setAgentId] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(() => buildDefaultSkillBody(acceptedCandidates, repoName));

  const agentOptions = [
    { value: "", label: t("createSkillModal.agentNone") },
    ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: v }));

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: name.trim() || buildDefaultSkillName(),
      description,
      type,
      enabled,
      body,
      ...(agentId ? { agent_id: agentId } : {}),
    });
    toast.success(t("createSkillModal.savedStatus"));
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("createSkillModal.title")}
      subtitle={banner}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("createSkillModal.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("createSkillModal.creating") : t("createSkillModal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("createSkillModal.fields.name")} required>
          <TextInput value={name} onChange={setName} />
        </FormField>
        <FormField label={t("createSkillModal.fields.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={t("createSkillModal.fields.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
        </FormField>
        <FormField label={t("createSkillModal.fields.agent")} hint={t("createSkillModal.agentHint")}>
          <SelectInput value={agentId} onChange={setAgentId} options={agentOptions} mono={false} />
        </FormField>
        <FormField label={t("createSkillModal.fields.enabled")} hint={t("createSkillModal.enabledCaption")}>
          <div style={s.enabledRow}>
            <Toggle on={enabled} onChange={setEnabled} />
          </div>
        </FormField>
        <FormField label={t("createSkillModal.fields.body")}>
          <SkillBodyEditor value={body} onChange={setBody} />
        </FormField>
      </div>
    </Modal>
  );
}
