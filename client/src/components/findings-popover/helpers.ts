import type { CSSProperties } from "react";
import { PANEL_GAP, PANEL_MAX_HEIGHT, PANEL_WIDTH, VIEWPORT_MARGIN } from "./constants";
import type { FindingPreviewLike } from "./types";

/** `src/api/users.ts:45-52`, collapsing a single-line range to `:45`. */
export function lineLabel(f: Pick<FindingPreviewLike, "start_line" | "end_line">): string {
  return f.end_line !== f.start_line ? `${f.start_line}-${f.end_line}` : `${f.start_line}`;
}

/**
 * Viewport coordinates for a panel hanging off `anchor`.
 *
 * Fixed positioning, because the panel is portaled out of the row: the PR
 * table clips its children to its rounded corners, so an absolutely positioned
 * panel inside the row would be cut off after a few pixels.
 */
export function panelPosition(anchor: DOMRect, viewport: { w: number; h: number }): CSSProperties {
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(anchor.left, viewport.w - PANEL_WIDTH - VIEWPORT_MARGIN),
  );
  const below = anchor.bottom + PANEL_GAP;
  // Flip above the trigger when the panel would run off the bottom — but only
  // if there is more room up there, so a short viewport still shows something.
  const flip = below + PANEL_MAX_HEIGHT > viewport.h && anchor.top > viewport.h - anchor.bottom;
  return flip
    ? { left, bottom: viewport.h - anchor.top + PANEL_GAP }
    : { left, top: below, maxHeight: Math.max(120, viewport.h - below - VIEWPORT_MARGIN) };
}
