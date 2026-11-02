"use client";

import React from "react";
import { s } from "../../styles";

/** One selectable agent card (role=checkbox, Space/Enter toggles). Text only, no markup from model output. */
export function AgentPickCard({
  id,
  name,
  summary,
  estimate,
  selected,
  onToggle,
}: {
  id: string;
  name: string;
  summary: string;
  estimate: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      data-agent-card={id}
      style={{ ...s.card, ...(selected ? s.cardSelected : {}) }}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div style={s.cardHead}>
        <span style={s.cardName}>{name}</span>
        <span style={s.cardMeta}>{estimate}</span>
      </div>
      {summary && <div style={s.cardSummary}>{summary}</div>}
    </div>
  );
}
