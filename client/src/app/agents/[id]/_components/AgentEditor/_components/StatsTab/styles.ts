import type { CSSProperties } from "react";

const card: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 16,
};

/** Co-located styles for StatsTab and its nested children. */
export const s = {
  root: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 1000 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" } satisfies CSSProperties,
  periodLabel: { margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  panelGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  errorBox: { ...card, padding: 0 } satisfies CSSProperties,

  kpiCard: { ...card, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  kpiLabel: { fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  kpiValueRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } satisfies CSSProperties,
  kpiValue: { fontSize: 26, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  kpiSub: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  kpiDelta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  estimateTag: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600 } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  panel: { ...card, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } satisfies CSSProperties,
  panelTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  panelNote: { margin: 0, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  panelEmpty: { margin: 0, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  panelFooter: { margin: 0, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  usageRow: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 120px 44px", alignItems: "center", gap: 10, fontSize: 13 } satisfies CSSProperties,
  usageName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  barTrack: { height: 8, borderRadius: 4, background: "var(--bg-hover)", overflow: "hidden" } satisfies CSSProperties,
  barFill: (share: number): CSSProperties => ({
    height: "100%",
    width: `${Math.max(0, Math.min(1, share)) * 100}%`,
    background: "var(--accent)",
  }),
  usageShare: { textAlign: "right", color: "var(--text-secondary)" } satisfies CSSProperties,

  bars: { display: "flex", alignItems: "flex-end", gap: 6, height: 120 } satisfies CSSProperties,
  barCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" } satisfies CSSProperties,
  barStack: { width: "100%", maxWidth: 28, display: "flex", flexDirection: "column", justifyContent: "flex-end", flex: 1, minHeight: 0 } satisfies CSSProperties,
  barSeg: (height: number, color: string): CSSProperties => ({ height: `${height}%`, background: color, width: "100%" }),
  barLabel: { fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  legendRow: { display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)", minWidth: 0 } satisfies CSSProperties,
  swatch: { width: 9, height: 9, borderRadius: 2, flexShrink: 0 } satisfies CSSProperties,

  donutBody: { display: "flex", alignItems: "center", gap: 16 } satisfies CSSProperties,
  donutRing: { position: "relative", flexShrink: 0 } satisfies CSSProperties,
  donutCenter: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  legendList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 } satisfies CSSProperties,
  smallSample: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600 } satisfies CSSProperties,
};
