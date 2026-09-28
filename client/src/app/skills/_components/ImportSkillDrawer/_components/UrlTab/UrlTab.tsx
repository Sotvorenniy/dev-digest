"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Markdown, TextInput } from "@devdigest/ui";
import { useCreateSkill, useFetchSkillUrl } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

/** URL tab — server-side fetch-and-preview, then a separate confirm step to
 *  actually persist it. The server forces `enabled: false` on import; this
 *  tab never tries to override that. */
export function UrlTab({ onDone }: { onDone: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const fetchUrl = useFetchSkillUrl();
  const create = useCreateSkill();
  const [url, setUrl] = React.useState("");
  const preview = fetchUrl.data;

  const submit = () => {
    if (!preview) return;
    create.mutate(
      { name: preview.name, description: "", type: "custom", body: preview.body, source: "imported_url" },
      {
        onSuccess: (skill) => {
          toast.success(t("url.success", { name: skill.name }));
          onDone();
        },
      },
    );
  };

  return (
    <div>
      <FormField label={t("url.label")} hint={t("url.hint")}>
        <TextInput
          value={url}
          onChange={(v) => {
            setUrl(v);
            if (fetchUrl.data || fetchUrl.error) fetchUrl.reset();
          }}
          placeholder={t("url.placeholder")}
        />
      </FormField>
      <div style={s.actions}>
        <Button
          kind="secondary"
          icon="Search"
          onClick={() => fetchUrl.mutate(url)}
          disabled={!url.trim() || fetchUrl.isPending}
        >
          {fetchUrl.isPending ? t("url.fetching") : t("url.fetch")}
        </Button>
      </div>
      {preview && (
        <FormField label={t("url.previewLabel")}>
          <div style={s.preview}>
            <Markdown>{preview.body}</Markdown>
          </div>
        </FormField>
      )}
      <div style={s.actions}>
        <Button kind="primary" icon="Upload" onClick={submit} disabled={!preview || create.isPending}>
          {create.isPending ? t("url.importing") : t("url.import")}
        </Button>
      </div>
    </div>
  );
}
