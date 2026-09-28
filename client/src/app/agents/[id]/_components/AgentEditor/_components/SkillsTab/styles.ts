import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { marginBottom: 16 } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 14 } satisfies CSSProperties,
  filter: { marginBottom: 14 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 500, flex: 1 } satisfies CSSProperties,
  reorder: { display: "flex", gap: 2 } satisfies CSSProperties,
} as const;
