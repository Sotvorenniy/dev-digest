import type { CSSProperties } from "react";
import type { Line } from "./helpers";
import { SEV, SEV_FALLBACK } from "./constants";

/** Co-located styles for the DiffViewer (extracted from inline styles). */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  empty: { padding: "24px", fontSize: 14, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  fileCard: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  fileHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filePath: {
    fontSize: 13,
    fontWeight: 500,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  fileStat: { fontSize: 12 } satisfies CSSProperties,
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  fileBody: {
    borderTop: "1px solid var(--border)",
    padding: "8px 0",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  noDiff: {
    padding: "14px 18px",
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
  hunk: {
    fontSize: 12,
    lineHeight: "20px",
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "0 14px",
  } satisfies CSSProperties,
  lineNo: {
    width: 44,
    textAlign: "right",
    padding: "0 10px 0 0",
    color: "var(--text-muted)",
    userSelect: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
  lineText: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-primary)",
    paddingRight: 12,
  } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the file card is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}

/** Row background per line kind (add/del tinted, others transparent). */
export function lineRowFor(kind: Line["kind"]): CSSProperties {
  const background = kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent";
  return { display: "flex", alignItems: "stretch", fontSize: 13, lineHeight: "20px", background };
}

/** Gutter sign colour per line kind. */
export function lineSignFor(kind: Line["kind"]): CSSProperties {
  return {
    width: 14,
    textAlign: "center",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-muted)",
    flexShrink: 0,
  };
}

/** Colour for a severity (bar, label, dot). */
export function sevColor(severity: string | null | undefined): string {
  return (severity && SEV[severity]) || SEV_FALLBACK;
}

/** Finding styles (opt-in; only used when findings are passed). */
export const fs = {
  dot: (severity: string | null): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: sevColor(severity),
    flexShrink: 0,
  }),
  /** Left bar on the flagged line, absolutely positioned so layout does not shift. */
  bar: (severity: string): CSSProperties => ({
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    background: sevColor(severity),
  }),
  label: (severity: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    alignSelf: "center",
    margin: "0 10px",
    padding: "0 6px",
    fontSize: 11.5,
    lineHeight: "16px",
    fontWeight: 600,
    borderRadius: 4,
    color: sevColor(severity),
    border: `1px solid ${sevColor(severity)}`,
    flexShrink: 0,
  }),
  inlineWrap: { margin: "6px 14px 8px 58px" } satisfies CSSProperties,
  unanchoredWrap: { margin: "8px 14px 4px 58px", display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  card: (severity: string, muted: boolean): CSSProperties => ({
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: sevColor(severity),
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "12px 14px",
    opacity: muted ? 0.6 : 1,
  }),
  collapseBtn: { display: "inline-flex", padding: 0, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)" } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({ transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }),
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  title: (muted: boolean, dismissed: boolean): CSSProperties => ({
    fontSize: 14,
    fontWeight: 600,
    color: muted ? "var(--text-muted)" : "var(--text-primary)",
    textDecoration: dismissed ? "line-through" : "none",
  }),
  meta: { display: "flex", alignItems: "center", gap: 10, marginTop: 4, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  tag: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  prose: { fontSize: 13, lineHeight: "19px", color: "var(--text-secondary)", marginTop: 8, wordBreak: "break-word" } satisfies CSSProperties,
  fixWrap: { marginTop: 10, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-surface)" } satisfies CSSProperties,
  fixLabel: { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, marginTop: 12 } satisfies CSSProperties,
} as const;
