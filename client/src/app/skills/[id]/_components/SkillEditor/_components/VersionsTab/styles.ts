import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 820, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  empty: { fontSize: 14, color: "var(--text-muted)", padding: "24px 0" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowMain: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  version: { fontSize: 13, fontWeight: 700, flexShrink: 0 } satisfies CSSProperties,
  note: {
    fontSize: 13,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  rowMeta: { display: "flex", alignItems: "center", gap: 14, flexShrink: 0 } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
  modalBody: { padding: 20 } satisfies CSSProperties,
} as const;
