"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, FormField, Markdown, TextInput, Textarea } from "@devdigest/ui";
import { useCreateSkill } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { deriveNameFromBody, extractZipCandidates, type ZipCandidate } from "./helpers";
import { s } from "./styles";

/** File tab — paste/type a body, or upload a .md/.txt file directly or a
 *  .zip to pick a text entry from. Preview must be non-empty before import
 *  is enabled. */
export function FileTab({ onDone }: { onDone: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const [candidates, setCandidates] = React.useState<ZipCandidate[]>([]);
  const [selected, setSelected] = React.useState(0);
  const [fileError, setFileError] = React.useState<string | null>(null);

  const onFile = async (file: File) => {
    setFileError(null);
    setCandidates([]);
    if (file.name.toLowerCase().endsWith(".zip")) {
      const found = await extractZipCandidates(file);
      if (found.length === 0) {
        setFileError(t("file.zipEmpty"));
        return;
      }
      setCandidates(found);
      setSelected(0);
      setBody(found[0]!.text);
    } else {
      setBody(await file.text());
    }
  };

  const submit = () =>
    create.mutate(
      {
        name: name.trim() || deriveNameFromBody(body) || "untitled-skill",
        description: "",
        type: "custom",
        body,
        source: "manual",
      },
      {
        onSuccess: (skill) => {
          toast.success(t("file.success", { name: skill.name }));
          onDone();
        },
      },
    );

  return (
    <div>
      <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
        <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} />
      </FormField>
      <FormField label={t("file.uploadLabel")} hint={t("file.uploadHint")}>
        <input
          type="file"
          accept=".md,.markdown,.zip"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </FormField>
      {fileError && <div style={s.error}>{fileError}</div>}
      {candidates.length > 1 && (
        <FormField label={t("file.zipCandidates")}>
          <div style={s.candidateList}>
            {candidates.map((c, i) => (
              <Chip
                key={c.path}
                active={i === selected}
                onClick={() => {
                  setSelected(i);
                  setBody(c.text);
                }}
              >
                {c.path}
              </Chip>
            ))}
          </div>
        </FormField>
      )}
      <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
        <Textarea value={body} onChange={setBody} rows={10} mono placeholder={t("file.bodyPlaceholder")} />
      </FormField>
      {body.trim().length > 0 && (
        <FormField label={t("file.previewLabel")}>
          <div style={s.preview}>
            <Markdown>{body}</Markdown>
          </div>
        </FormField>
      )}
      <div style={s.actions}>
        <Button kind="primary" icon="Upload" onClick={submit} disabled={create.isPending || body.trim().length === 0}>
          {create.isPending ? t("file.importing") : t("file.import")}
        </Button>
      </div>
    </div>
  );
}
