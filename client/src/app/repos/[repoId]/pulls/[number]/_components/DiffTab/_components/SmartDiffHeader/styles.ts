import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  title: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  summary: { fontSize: 14, color: "var(--text-secondary)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } satisfies CSSProperties,
  add: { color: "var(--code-add-text)" } satisfies CSSProperties,
  del: { color: "var(--code-del-text)" } satisfies CSSProperties,
  right: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  toggle: {
    display: "inline-flex",
    padding: 2,
    gap: 2,
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  toggleBtn: (active: boolean): CSSProperties => ({
    border: "none",
    borderRadius: 5,
    padding: "5px 12px",
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    background: active ? "var(--bg-elevated)" : "transparent",
  }),
} as const;
