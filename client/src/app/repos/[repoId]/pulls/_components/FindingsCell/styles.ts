import type { CSSProperties } from "react";

export const s = {
  cell: { display: "flex", alignItems: "center", minWidth: 0 } satisfies CSSProperties,
} as const;
