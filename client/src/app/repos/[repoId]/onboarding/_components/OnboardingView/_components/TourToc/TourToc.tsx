"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { sectionAnchors } from "../../helpers";
import { s } from "../../styles";

/** "On this page" nav. Activating a link scrolls to and focuses the section heading. */
export function TourToc() {
  const t = useTranslations("onboarding");

  const go = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView?.({ block: "start" });
    el.focus();
  };

  return (
    <nav style={s.toc} aria-label={t("toc.title")} data-onboarding-toc>
      <div style={s.tocTitle}>{t("toc.title")}</div>
      <ul style={s.tocList}>
        {sectionAnchors().map(({ key, id }) => (
          <li key={key}>
            <a href={`#${id}`} style={s.tocLink} onClick={(e) => go(e, id)}>
              {t(`sections.${key}`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
