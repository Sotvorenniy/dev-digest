"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { s } from "./styles";

/** Community tab — copy + layout for the vetted-catalog search, fully
 *  disabled: no live search, no backend call, no CommunitySkill fetch. */
export function CommunityTab() {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <input disabled placeholder={t("community.searchPlaceholder")} style={s.disabledInput} />
      <EmptyState icon="Users" title={t("drawer.tabs.community")} body={t("community.comingSoon")} />
    </div>
  );
}
