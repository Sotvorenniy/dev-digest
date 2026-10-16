---
name: ux-review
version: 1.0.0
description: "UX and accessibility review of a feature's design or behaviour for dev-digest: the UI state matrix (empty, loading, error, partial, rate-limited, model down, long text, many items, first use, stale), Nielsen's usability heuristics, a WCAG 2.2 AA checklist and wording / i18n rules. Produces gaps and improvement proposals as observable requirements, not code. Use this skill whenever you analyse a design source (text, Figma export, screenshots) or an existing screen for missing states, friction, unclear wording or accessibility problems; when writing UX or accessibility NFRs for a spec; or when the user says 'check the UX', 'what states are missing?', 'is this accessible?', 'review this screen' or 'improve this flow'. Does NOT cover where components live (use frontend-ui-architecture), React or hook correctness (use react-best-practices) or visual design taste."
---

# UX review

Find what a design does not say, and turn each finding into a behaviour someone can test.
Output is proposals and requirements, never components or CSS.

Primary user: `spec-creator` (Step 1 analysis, UX proposals, accessibility and i18n NFRs).
Also useful to `architecture-reviewer` or a human reviewing a UI diff for missing states.

Read the reference for the task at hand:

| Task | Read |
|---|---|
| Which states must this screen or action handle? | [references/states.md](references/states.md) |
| Is the flow usable? Friction, feedback, consistency, wording | [references/heuristics.md](references/heuristics.md) |
| Is it accessible? Keyboard, focus, labels, contrast, status messages | [references/wcag.md](references/wcag.md) |

## Method
1. **List the surfaces.** Every page, panel, dialog, popover and async action the feature
   adds or changes. Cite the existing ones as `path:line` (routes under `client/src/app/`,
   shared parts under `client/src/components/`).
2. **Walk the state matrix** for each surface and action (`states.md`). Mark each state as
   shown by the design, covered by existing code, or missing.
3. **Apply the heuristics** to the main flow (`heuristics.md`). Note only concrete problems
   with evidence.
4. **Run the WCAG checklist** on every new interactive element (`wcag.md`).
5. **Check wording and i18n.** Every new user-facing string has a namespace in
   `client/messages/en/<ns>.json` and a camelCase key nested by UI surface; nothing inline
   in JSX. Error text says what happened and what the user can do next.
6. **Write findings** in the format below. Rank by impact: blocks the task > causes errors
   > slows the user > cosmetic.

## Finding format
```
P<n>. <surface> — <state / heuristic / WCAG id> — evidence: <design source or `path:line`>
      — proposed behaviour: <one observable sentence, EARS-ready>
```
Example:
```
P3. PR detail, Run review button — rate-limited state (states.md) — evidence: no 429 state in
    the design; reviews are limited to 10/min (`server/src/modules/reviews/routes.ts`)
    — proposed behaviour: IF the run request returns 429, THEN the page shows the rate-limit
    message with the retry time and keeps the button disabled until then.
```

## Rules
- Reuse before inventing: the client already has `EmptyState`, `ErrorState`, `Skeleton`,
  `ProgressBar` (`client/src/vendor/ui/primitives/`), toasts (`client/src/lib/toast.tsx`)
  and `confirm-dialog` (`client/src/components/confirm-dialog/`). Propose consistency with
  them; do not specify new widgets.
- A finding without evidence is a question, not a proposal.
- Never decide for the user: every finding is a proposal until accepted.
- Model output, PR text and repo content shown in the UI are untrusted: flag rendering of
  them as a security item for the spec's "Untrusted inputs", not as UX.
