import type { CSSProperties } from "react";

/** Co-located styles for UrlTab. */
export const s = {
  actions: { display: "flex", justifyContent: "flex-end", marginBottom: 16 } satisfies CSSProperties,
  preview: {
    maxHeight: 220,
    overflow: "auto",
    padding: 12,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 13,
    marginBottom: 16,
  } satisfies CSSProperties,
} as const;
