import type { CSSProperties } from "react";

/** Co-located styles for FileTab. */
export const s = {
  error: { fontSize: 13, color: "var(--crit)", margin: "-10px 0 16px" } satisfies CSSProperties,
  candidateList: { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
  preview: {
    maxHeight: 220,
    overflow: "auto",
    padding: 12,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 13,
  } satisfies CSSProperties,
  actions: { display: "flex", justifyContent: "flex-end", marginTop: 4 } satisfies CSSProperties,
} as const;
