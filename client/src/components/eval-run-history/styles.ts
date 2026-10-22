import type { CSSProperties } from "react";

const ellipsis: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };

/** Co-located styles for EvalRunHistory and its nested CompareRunsDialog. */
export const s = {
  root: { display: "flex", flexDirection: "column", gap: 10, minWidth: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  heading: { margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" } satisfies CSSProperties,
  th: {
    textAlign: "left",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: {
    fontSize: 13,
    color: "var(--text-secondary)",
    padding: "8px",
    borderBottom: "1px solid var(--border)",
    ...ellipsis,
  } satisfies CSSProperties,
  checkCol: { width: 40 } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  compareFooter: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  dialogBody: { display: "flex", flexDirection: "column", gap: 16, padding: "18px 24px", minWidth: 0 } satisfies CSSProperties,
  notice: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  compareGrid: { display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "6px 16px", fontSize: 13 } satisfies CSSProperties,
  compareHead: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)" } satisfies CSSProperties,
  compareLabel: { color: "var(--text-secondary)" } satisfies CSSProperties,
  compareValue: { color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  promptDiff: {
    margin: 0,
    padding: 10,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    maxHeight: 280,
    overflow: "auto",
  } satisfies CSSProperties,
  promptLine: (kind: "added" | "removed"): CSSProperties => ({
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    color: kind === "added" ? "var(--ok)" : "var(--text-secondary)",
    textDecoration: kind === "removed" ? "line-through" : "none",
  }),
} as const;
