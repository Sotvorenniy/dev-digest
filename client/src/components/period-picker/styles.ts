import type { CSSProperties } from "react";

export const s = {
  picker: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 } satisfies CSSProperties,
  pickerRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  pickerLabel: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  dateField: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  dateInput: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 13,
  } satisfies CSSProperties,
  dateInputInvalid: { borderColor: "var(--crit)" } satisfies CSSProperties,
  pickerError: { fontSize: 12, color: "var(--crit)", margin: 0 } satisfies CSSProperties,
};
