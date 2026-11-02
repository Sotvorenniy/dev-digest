"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "../../styles";

export type ResultsView = "columns" | "tabs";

export function ViewToggle({ value, onChange }: { value: ResultsView; onChange: (v: ResultsView) => void }) {
  const t = useTranslations("runs");
  return (
    <div role="radiogroup" aria-label={t("page.view.label")} style={s.toggle}>
      {(["columns", "tabs"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          data-view-toggle={v}
          style={s.toggleBtn(value === v)}
          onClick={() => onChange(v)}
        >
          {t(`page.view.${v}`)}
        </button>
      ))}
    </div>
  );
}
