import type { CSSProperties } from "react";

export const s = {
  section: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  notice: {
    fontSize: 13,
    color: "var(--warn)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 12px",
  } satisfies CSSProperties,
} as const;
