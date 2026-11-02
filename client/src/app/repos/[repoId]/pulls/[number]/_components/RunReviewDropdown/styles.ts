import type { CSSProperties } from "react";

/** Co-located styles for RunReviewDropdown (absolute panel, like the kit Dropdown). */
export const s = {
  root: { position: "relative", display: "inline-block" },
  panel: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: 10,
    zIndex: 40,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  option: { padding: "2px 0" },
  muted: { fontSize: 12, color: "var(--text-muted)" },
  actions: { display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 },
  error: { fontSize: 12, color: "var(--danger)" },
  link: {
    background: "none",
    border: "none",
    padding: 0,
    textAlign: "left",
    fontSize: 12,
    color: "var(--text-muted)",
    cursor: "pointer",
  },
} satisfies Record<string, CSSProperties>;
