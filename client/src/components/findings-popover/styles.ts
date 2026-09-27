import type { CSSProperties } from "react";
import { PANEL_MAX_HEIGHT, PANEL_WIDTH, RATIONALE_LINES } from "./constants";

/** Co-located styles for FindingsPopover. Panel chrome mirrors the ui kit's
    Dropdown menu so the two read as the same surface. */
export const s = {
  wrap: { position: "relative", display: "inline-flex", alignItems: "center" } satisfies CSSProperties,
  panel: {
    position: "fixed",
    width: PANEL_WIDTH,
    maxWidth: `min(92vw, ${PANEL_WIDTH}px)`,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    zIndex: 60,
    animation: "ddpop .12s ease",
    cursor: "default",
    textAlign: "left",
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  scroll: {
    maxHeight: PANEL_MAX_HEIGHT,
    overflowY: "auto",
    padding: "4px 0",
  } satisfies CSSProperties,
  row: {
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  lastRow: { borderBottom: "none" } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  title: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 5,
  } satisfies CSSProperties,
  /** Read-only twin of MonoLink — a span, because the popover carries no
      interactive elements at all (it is a preview, not a control surface). */
  file: {
    fontSize: 12.5,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  rationale: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: RATIONALE_LINES,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as CSSProperties,
} as const;
