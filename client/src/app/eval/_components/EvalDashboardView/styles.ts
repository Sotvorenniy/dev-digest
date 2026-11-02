import type { CSSProperties } from "react";

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};

const cell: CSSProperties = { padding: "10px 12px", textAlign: "left", verticalAlign: "middle" };

export const s = {
  // EvalDashboardView
  root: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  skeletonRows: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  errorBox: { ...card } satisfies CSSProperties,
  heading: { margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  emptyLink: { color: "var(--accent-text)", textDecoration: "none", fontWeight: 600 } satisfies CSSProperties,

  // AgentEvalRow
  row: {
    ...card,
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) auto minmax(0, 3fr) auto",
    alignItems: "center",
    gap: 16,
    padding: "12px 16px",
    textDecoration: "none",
    color: "inherit",
  } satisfies CSSProperties,
  name: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  } satisfies CSSProperties,
  model: {
    fontSize: 11,
    color: "var(--text-secondary)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "2px 8px",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  meta: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  metrics: { display: "flex", gap: 12, color: "var(--text-primary)" } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  spark: { display: "inline-flex", alignItems: "center", minWidth: 80 } satisfies CSSProperties,

  // RecentEvalRuns
  table: { ...card, width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: { ...cell, fontSize: 12, fontWeight: 600, color: "var(--text-muted)", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  td: { ...cell, color: "var(--text-primary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
