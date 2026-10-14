"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { NoteKey } from "../../helpers";
import { API_KEYS_HREF } from "../../constants";
import { s } from "../../styles";

/** One note per active condition (stale, partial index, skeleton reason, …). */
export function StatusNotes({ notes }: { notes: NoteKey[] }) {
  const t = useTranslations("onboarding");
  if (notes.length === 0) return null;
  return (
    <div style={s.notes}>
      {notes.map((key) => (
        <div key={key} style={s.note} data-onboarding-note={key}>
          {t(`notes.${key}`)}
          {key === "skeleton.no_api_key" && (
            <Link href={API_KEYS_HREF} style={s.noteLink}>
              {t("notes.settingsLink")}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
