import type { CSSProperties } from "react";

export const s = {
  body: { display: "flex", flexDirection: "column", gap: 12, padding: "18px 24px" } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  jsonState: { fontSize: 12 } satisfies CSSProperties,
  jsonOk: { color: "var(--text-muted)" } satisfies CSSProperties,
  jsonBad: { color: "var(--danger, #e5484d)" } satisfies CSSProperties,
  result: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
  } satisfies CSSProperties,
  resultList: { margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--danger, #e5484d)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
