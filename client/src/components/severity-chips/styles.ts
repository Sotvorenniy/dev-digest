import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  /** Dotted underline marks the chips as the hover target for the popover. */
  chip: (color: string, hoverable: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    color,
    textDecoration: hoverable ? "underline" : "none",
    textDecorationStyle: "dotted",
    textUnderlineOffset: 3,
  }),
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
