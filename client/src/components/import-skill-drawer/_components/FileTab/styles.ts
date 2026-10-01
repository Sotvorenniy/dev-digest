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
  previewCard: {
    padding: 14,
    marginBottom: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  previewTitle: { fontSize: 13, fontWeight: 700, marginBottom: 10 } satisfies CSSProperties,
  previewRow: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, fontSize: 13 } satisfies CSSProperties,
  previewKey: { color: "var(--text-muted)", width: 90, flexShrink: 0 } satisfies CSSProperties,
  previewValue: { color: "var(--text-secondary)", lineHeight: 1.4 } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--warn)", lineHeight: 1.4 } satisfies CSSProperties,
  actions: { display: "flex", justifyContent: "flex-end", marginTop: 4 } satisfies CSSProperties,
} as const;
