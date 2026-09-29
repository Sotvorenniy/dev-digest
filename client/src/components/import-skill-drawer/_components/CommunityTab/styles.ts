import type { CSSProperties } from "react";

/** Co-located styles for CommunityTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  disabledInput: {
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-muted)",
    fontSize: 14,
    cursor: "not-allowed",
    width: "100%",
  } satisfies CSSProperties,
} as const;
