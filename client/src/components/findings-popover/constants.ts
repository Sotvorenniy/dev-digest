/** Panel geometry. Tall enough for ~3 findings; the rest scrolls. */
export const PANEL_WIDTH = 500;
export const PANEL_MAX_HEIGHT = 420;

/** Gap between the trigger and the panel, and the margin kept off the viewport edge. */
export const PANEL_GAP = 6;
export const VIEWPORT_MARGIN = 8;

/**
 * Grace period before a mouse-out closes the panel. The panel is portaled to
 * <body> to escape the PR table's `overflow: hidden`, so it is not a DOM child
 * of the trigger — without this, crossing the gap on the way to scrolling a
 * long run's findings would dismiss it.
 */
export const CLOSE_DELAY_MS = 120;

/** How many lines of a finding's description survive the clamp. */
export const RATIONALE_LINES = 2;
