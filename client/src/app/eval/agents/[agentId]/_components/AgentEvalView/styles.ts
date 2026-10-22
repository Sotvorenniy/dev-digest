import type { CSSProperties } from "react";

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};

export const s = {
  // AgentEvalView
  root: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  skeletonRows: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  errorBox: { ...card } satisfies CSSProperties,
  back: { color: "var(--accent-text)", textDecoration: "none", fontWeight: 600, fontSize: 13 } satisfies CSSProperties,
  titleRow: { display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  titleName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } satisfies CSSProperties,
  model: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-secondary)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "2px 8px",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  error: { ...card, padding: 12, fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  link: { color: "var(--accent-text)", fontWeight: 600 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,

  // EvalTrend
  trend: { ...card, padding: 16, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  trendHeading: { margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  legend: { display: "flex", gap: 14, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatch: { width: 10, height: 10, borderRadius: 2, display: "inline-block" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
