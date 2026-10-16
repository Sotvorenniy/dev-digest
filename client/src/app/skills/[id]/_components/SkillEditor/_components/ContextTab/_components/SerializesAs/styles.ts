import type { CSSProperties } from "react";

export const s = {
  wrap: {
    marginTop: 20,
    padding: 16,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  title: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 12 } satisfies CSSProperties,
  code: {
    margin: 0,
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    overflowX: "auto",
  } satisfies CSSProperties,
  heading: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  group: { marginTop: 8 } satisfies CSSProperties,
  groupLabel: { color: "var(--text-primary)" } satisfies CSSProperties,
  groupCount: { color: "var(--text-muted)" } satisfies CSSProperties,
  item: { paddingLeft: 16, whiteSpace: "nowrap" } satisfies CSSProperties,
  meta: { color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
