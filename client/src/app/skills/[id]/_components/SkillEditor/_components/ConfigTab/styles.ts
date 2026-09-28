import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  bodyHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  } satisfies CSSProperties,
  filename: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  tokenCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 } satisfies CSSProperties,
  changeNote: { flex: 1, maxWidth: 320 } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
} as const;
