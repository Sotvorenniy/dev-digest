import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "6px 4px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  }),
  swatch: (color: string): CSSProperties => ({ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }),
  label: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  description: { fontSize: 13, color: "var(--text-muted)", flex: 1, minWidth: 0 } satisfies CSSProperties,
  findings: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  dot: { width: 7, height: 7, borderRadius: "50%", background: "var(--crit)" } satisfies CSSProperties,
  count: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
