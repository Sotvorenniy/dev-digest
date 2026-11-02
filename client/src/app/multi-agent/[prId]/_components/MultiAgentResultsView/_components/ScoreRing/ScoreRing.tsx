"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { RING_SIZE } from "../../constants";
import { s } from "../../styles";

/** Score 0-100 as a ring; "—" when the run has no score. */
export function ScoreRing({ score }: { score: number | null }) {
  const t = useTranslations("runs");
  const r = (RING_SIZE - 6) / 2;
  const circ = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <div
      role="img"
      aria-label={score == null ? t("column.noScore") : t("column.score", { score })}
      style={{ ...s.ring, width: RING_SIZE, height: RING_SIZE, position: "relative" }}
    >
      <svg width={RING_SIZE} height={RING_SIZE} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={3} />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={3}
          strokeDasharray={`${circ * pct} ${circ}`}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </svg>
      <span aria-hidden="true">{score == null ? t("column.noScore") : score}</span>
    </div>
  );
}
