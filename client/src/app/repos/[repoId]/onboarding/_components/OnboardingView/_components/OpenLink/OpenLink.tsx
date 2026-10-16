"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "../../styles";

/** "Open on GitHub" link pinned to the indexed commit. Renders nothing when
 *  there is no sha — an unpinned link would look pinned but isn't. */
export function OpenLink({ repoFullName, sha, path }: { repoFullName: string; sha: string; path: string }) {
  const t = useTranslations("onboarding");
  if (!sha) return null;
  return (
    <a
      href={githubBlobUrl(repoFullName, sha, path)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("open", { path })}
      style={s.openLink}
      data-onboarding-open
    >
      <Icon.ExternalLink size={14} aria-hidden />
    </a>
  );
}
