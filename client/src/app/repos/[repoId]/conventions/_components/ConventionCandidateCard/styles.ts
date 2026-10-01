import type { CSSProperties } from "react";

/** Co-located styles for ConventionCandidateCard. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  } satisfies CSSProperties,
  rule: {
    flex: 1,
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  ruleField: { flex: 1 } satisfies CSSProperties,
  actions: { display: "flex", gap: 4, flexShrink: 0 } satisfies CSSProperties,
  snippetBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  snippetHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "6px 10px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  snippetPath: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  snippetPre: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  confidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  confidenceLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  confidenceBar: { flex: 1 } satisfies CSSProperties,
  confidencePct: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    flexShrink: 0,
    minWidth: 34,
    textAlign: "right",
  } satisfies CSSProperties,
  footerActions: { display: "flex", gap: 10 } satisfies CSSProperties,
  editActions: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
