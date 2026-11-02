import type { CSSProperties } from "react";
import { COLUMN_MIN_WIDTH } from "./constants";

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 14,
};

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  meta: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  toggle: { display: "inline-flex", gap: 4 } satisfies CSSProperties,
  toggleBtn: (on: boolean): CSSProperties => ({
    padding: "5px 12px",
    borderRadius: 7,
    fontSize: 13,
    cursor: "pointer",
    border: "1px solid " + (on ? "var(--accent)" : "var(--border-strong)"),
    background: on ? "var(--accent)" : "transparent",
    color: on ? "#fff" : "var(--text-secondary)",
  }),
  columns: { display: "flex", gap: 12, overflowX: "auto", alignItems: "flex-start" } satisfies CSSProperties,
  column: { ...card, flex: `1 0 ${COLUMN_MIN_WIDTH}px`, minWidth: COLUMN_MIN_WIDTH, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  colHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  row: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--danger)", overflowWrap: "anywhere" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  listItem: { fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  tabs: { display: "flex", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  tabBtn: (on: boolean): CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 7,
    fontSize: 13,
    cursor: "pointer",
    border: "1px solid " + (on ? "var(--accent)" : "var(--border)"),
    background: on ? "var(--bg-elevated)" : "transparent",
    color: "var(--text-primary)",
  }),
  panel: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  summaryCard: { ...card, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  summaryText: { fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  sectionTitle: { fontSize: 15, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  tableWrap: { overflowX: "auto" } satisfies CSSProperties,
  table: { borderCollapse: "collapse", width: "100%", fontSize: 13 } satisfies CSSProperties,
  cell: { padding: "8px 10px", textAlign: "left", verticalAlign: "top", borderBottom: "1px solid var(--border)", overflowWrap: "anywhere" } satisfies CSSProperties,
  take: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  takeHead: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  ring: { display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
};
