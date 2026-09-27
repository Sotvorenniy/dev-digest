import type { CSSProperties } from "react";

export const s = {
  /** PR-list cell: mono so the decimal points line up down the column. */
  cell: (known: boolean): CSSProperties => ({
    fontSize: 12.5,
    color: known ? "var(--text-secondary)" : "var(--text-muted)",
    whiteSpace: "nowrap",
  }),
  /** Timeline run row: sits under the timestamp, same muted weight. */
  inline: {
    fontSize: 11,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
