# WCAG 2.2 AA checklist (subset for dev-digest)

Run on every new or changed interactive element. Each failed item becomes a proposal or an
accessibility NFR with a testable result (the `client` lane can check most of them with
RTL queries by role and name).

## Keyboard and focus
| WCAG | Check | Testable as |
|---|---|---|
| 2.1.1 Keyboard | Every action works with the keyboard alone | reachable by Tab, activated by Enter / Space |
| 2.1.2 No keyboard trap | Focus can always leave a widget | Escape or Tab leaves the popover, editor, drawer |
| 2.4.3 Focus order | Tab order follows the visual and logical order | expected order of focusable elements |
| 2.4.7 Focus visible | Focus is always visible | visible focus style on every focusable element |
| 2.4.11 Focus not obscured | Sticky headers or popovers do not hide the focused element | focused element in view |
| — Dialogs | Focus moves into a dialog, stays there, returns to the trigger on close | focus target on open and on close |

## Names, roles, structure
| WCAG | Check | Testable as |
|---|---|---|
| 1.1.1 Non-text content | Icon-only buttons (`IconBtn`) and meaningful icons have a text name | `getByRole('button', { name })` |
| 1.3.1 Info and relationships | Headings, lists, tables and form labels are real structure | roles `heading`, `table`, `row`; label linked to input |
| 2.4.6 Headings and labels | Headings and labels describe their content | named sections |
| 3.3.2 Labels or instructions | Every input has a visible label | `getByLabelText` |
| 4.1.2 Name, role, value | Custom widgets (toggle, chips, tabs, popover trigger) expose role and state | `aria-pressed`, `aria-expanded`, `aria-selected` |

## Feedback and errors
| WCAG | Check | Testable as |
|---|---|---|
| 4.1.3 Status messages | Toasts, "review finished", Live Log updates and result counts are announced without moving focus | `role="status"` / `aria-live="polite"`; `role="alert"` only for errors |
| 3.3.1 Error identification | Errors are described in text, not only by colour | error text present |
| 3.3.3 Error suggestion | The error says how to fix it | text names the fix |
| 3.3.4 / 3.3.7 | Destructive actions confirmed; already-entered data not asked again | confirm step; fields kept after an error |
| 2.2.1 Timing adjustable | No action expires silently while the user reads | no auto-dismiss for errors |

## Visual
| WCAG | Check | Testable as |
|---|---|---|
| 1.4.1 Use of colour | Severity is not shown by colour alone (text or icon too) | severity label text present |
| 1.4.3 Contrast (minimum) | Text contrast at least 4.5:1 (3:1 for large text) | token pair from `tokens.ts` meets the ratio |
| 1.4.11 Non-text contrast | Borders, focus rings, chart lines at least 3:1 | token pair meets the ratio |
| 1.4.4 / 1.4.10 Resize and reflow | Works at 200% zoom and 320 CSS px width without horizontal scroll (code and diff views excepted) | manual or e2e at narrow viewport |
| 2.5.8 Target size (minimum) | Pointer targets at least 24×24 CSS px | size of icon buttons and chips |

## Charts (Recharts)
- Data is available as text too (table, labels or summary).
- Series are told apart by more than colour.
