import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  intentText: {
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.55,
    margin: 0,
  } satisfies CSSProperties,
  badges: { display: "flex", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  disclaimer: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  warning: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--warn)",
  } satisfies CSSProperties,
  columns: { display: "flex", gap: 24, flexWrap: "wrap" } satisfies CSSProperties,
  column: { flex: "1 1 240px", minWidth: 0 } satisfies CSSProperties,
  listLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  list: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  none: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  sourceRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  sourceRef: { color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
