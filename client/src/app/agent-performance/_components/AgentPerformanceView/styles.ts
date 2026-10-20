import type { CSSProperties } from "react";

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 16,
};

const cell: CSSProperties = { padding: "10px 12px", textAlign: "left", verticalAlign: "middle" };

export const s = {
  // AgentPerformanceView
  root: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  skeletonGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  skeletonRows: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  skeletonDonuts: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  errorBox: { ...card, padding: 0 } satisfies CSSProperties,

  // KpiCards
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  kpiCard: { ...card, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  kpiLabel: { fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  kpiValueRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } satisfies CSSProperties,
  kpiValue: { fontSize: 26, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  kpiSub: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  estimateTag: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600 } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  ringWrap: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  ringBox: { position: "relative", width: 44, height: 44, flexShrink: 0 } satisfies CSSProperties,
  ringSvg: { transform: "rotate(-90deg)" } satisfies CSSProperties,
  mostActiveName: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  // CostBreakdown / CostDonut
  breakdown: { ...card, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  breakdownHead: { display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  breakdownTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  breakdownNote: { margin: 0, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  donutGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 } satisfies CSSProperties,
  donut: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 } satisfies CSSProperties,
  donutTitle: { margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  donutBody: { display: "flex", alignItems: "center", gap: 16 } satisfies CSSProperties,
  legend: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 } satisfies CSSProperties,
  legendItem: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", minWidth: 0 } satisfies CSSProperties,
  swatch: { width: 9, height: 9, borderRadius: 2, flexShrink: 0 } satisfies CSSProperties,
  legendText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  noCost: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,

  // PerfTable / PerfRow
  tableWrap: { ...card, padding: 0, overflowX: "auto" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    ...cell,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  sortButton: {
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    color: "inherit",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,
  td: { ...cell, borderBottom: "1px solid var(--border)", color: "var(--text-primary)" } satisfies CSSProperties,
  agentCell: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  expandButton: {
    background: "none",
    border: "none",
    padding: 2,
    cursor: "pointer",
    color: "var(--text-secondary)",
    display: "inline-flex",
    flexShrink: 0,
  } satisfies CSSProperties,
  agentName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 220,
    fontWeight: 600,
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  acceptCell: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  trendUp: { color: "var(--ok)", display: "inline-flex" } satisfies CSSProperties,
  trendDown: { color: "var(--crit)", display: "inline-flex" } satisfies CSSProperties,
  viewLink: { color: "var(--accent-text)", textDecoration: "none", fontWeight: 600 } satisfies CSSProperties,
  detailsCell: { ...cell, background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  detailsGrid: { display: "flex", gap: 32, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  detailsGroup: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  detailsHeading: { fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  detailsList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
};
