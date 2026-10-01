"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { estimateTokens } from "@/lib/tokens";
import { SkillBodyEditor } from "@/components/skill-body-editor/SkillBodyEditor";
import { SKILL_TYPES } from "./constants";
import { s } from "./styles";

/** Config tab — name/description/type + the markdown body editor. Draft state
 *  is seeded once per skill; the parent keys this component by skill id, so
 *  switching skills remounts it (same pattern as the Agent editor's ConfigTab). */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [changeNote, setChangeNote] = React.useState("");

  const isDirty =
    name !== skill.name || description !== skill.description || type !== skill.type || body !== skill.body;
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, change_note: changeNote.trim() || undefined } },
      {
        // Failures surface via the global mutation error toast; confirm the
        // save with a success toast (not just the inline "Saved (vN)" note).
        onSuccess: (data) => {
          toast.success(t("config.savedToast", { version: data.version }));
          setChangeNote("");
        },
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <div style={{ marginLeft: "auto" }} aria-label={t("card.enabledLabel", { name: skill.name })}>
          <Toggle on={skill.enabled} onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })} />
        </div>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField
        label={t("config.body")}
        hint={t("config.bodyHint")}
        right={<span style={s.tokenCount}>{t("config.tokenCount", { count: estimateTokens(body) })}</span>}
      >
        <div style={s.bodyHeader}>
          <span className="mono" style={s.filename}>{`${name || "untitled-skill"}.md`}</span>
          {isDirty && (
            <Badge color="var(--warn)" bg="var(--warn-bg)">
              {t("config.unsaved")}
            </Badge>
          )}
        </div>
        <SkillBodyEditor value={body} onChange={setBody} placeholder={t("file.bodyPlaceholder")} />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <div style={s.changeNote}>
          <TextInput value={changeNote} onChange={setChangeNote} placeholder={t("config.changeNotePlaceholder")} />
        </div>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
